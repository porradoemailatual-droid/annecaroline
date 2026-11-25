import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Expand,
  ImagePlus,
  Images,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useBooking } from '../../context/BookingContext';
import type { GalleryItem } from '../../types/booking';
import { fetchR2Status, type R2StatusResponse } from '../../utils/r2Client';

function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function AdminMediaTab() {
  const {
    galleryItems,
    addGalleryItem,
    replaceGalleryItemPhoto,
    deleteGalleryItem,
    showToast,
  } = useBooking();

  const [r2Status, setR2Status] = useState<R2StatusResponse | null>(null);

  // Composer state for adding a new gallery work item
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [galleryTitle, setGalleryTitle] = useState('');
  const [galleryCaption, setGalleryCaption] = useState('');
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);

  // Replace / Delete / Lightbox state
  const [replacingGalleryId, setReplacingGalleryId] = useState<string | null>(null);
  const [deletingGalleryId, setDeletingGalleryId] = useState<string | null>(null);
  const [replaceTargetItem, setReplaceTargetItem] = useState<GalleryItem | null>(null);
  const [lightboxItem, setLightboxItem] = useState<GalleryItem | null>(null);

  const galleryFileRef = useRef<HTMLInputElement | null>(null);
  const replaceFileRef = useRef<HTMLInputElement | null>(null);

  const checkR2Health = useCallback(async () => {
    try {
      const status = await fetchR2Status();
      setR2Status(status);
    } catch {
      // Non-blocking: only display a banner if we confirm missing credentials
    }
  }, []);

  useEffect(() => {
    void checkR2Health();
  }, [checkR2Health]);

  useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl);
      }
    };
  }, [selectedPreviewUrl]);

  useEffect(() => {
    if (!lightboxItem) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxItem(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [lightboxItem]);

  const stageFileForUpload = (file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setGalleryError('Formato não suportado. Use PNG, JPG ou WebP.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setGalleryError('A imagem ultrapassa o limite de 5 MB.');
      return;
    }
    setGalleryError(null);
    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl);
    }
    setSelectedFile(file);
    setSelectedPreviewUrl(URL.createObjectURL(file));
    if (!galleryTitle.trim()) {
      const baseName = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ').trim();
      if (baseName) {
        setGalleryTitle(baseName.slice(0, 80));
      }
    }
  };

  const clearStagedFile = () => {
    if (selectedPreviewUrl) {
      URL.revokeObjectURL(selectedPreviewUrl);
    }
    setSelectedFile(null);
    setSelectedPreviewUrl(null);
    setGalleryError(null);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    stageFileForUpload(file);
  };

  const handlePublishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      galleryFileRef.current?.click();
      return;
    }

    setGalleryError(null);
    setUploadingGallery(true);
    try {
      await addGalleryItem(selectedFile, galleryTitle, galleryCaption);
      clearStagedFile();
      setGalleryTitle('');
      setGalleryCaption('');
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : 'Falha ao publicar foto na galeria.');
    } finally {
      setUploadingGallery(false);
    }
  };

  const handleReplaceGalleryPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = replaceTargetItem;
    setReplaceTargetItem(null);
    if (!file || !target) return;

    setGalleryError(null);
    setReplacingGalleryId(target.id);
    try {
      await replaceGalleryItemPhoto(target, file);
    } catch (err) {
      setGalleryError(err instanceof Error ? err.message : 'Falha ao substituir foto da galeria.');
    } finally {
      setReplacingGalleryId(null);
    }
  };

  const handleDeleteGallery = async (item: GalleryItem) => {
    setDeletingGalleryId(item.id);
    try {
      await deleteGalleryItem(item);
      if (lightboxItem?.id === item.id) {
        setLightboxItem(null);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Falha ao excluir foto da galeria.');
    } finally {
      setDeletingGalleryId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 px-0.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#f5f5f7]">
            Galeria
          </h1>
          <p className="text-sm text-[#8e8e93] mt-0.5">
            Trabalhos realizados exibidos para os clientes na tela inicial.
          </p>
        </div>
        <div className="text-xs font-medium text-[#aeaeb2] tabular-nums">
          {galleryItems.length === 0
            ? 'Nenhuma foto publicada'
            : galleryItems.length === 1
              ? '1 trabalho publicado'
              : `${galleryItems.length} trabalhos publicados`}
        </div>
      </div>

      {/* Only surface a notice when server R2 credentials are missing */}
      {r2Status && !r2Status.connected && (
        <div
          role="alert"
          className="rounded-[20px] bg-[#2c1b16] border border-[#ff9f0a]/30 p-4 flex items-start gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-[#ff9f0a] shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs text-[#f5f5f7]">
            <p className="font-semibold text-[#ffd60a]">
              Armazenamento de imagens aguardando configuração no servidor
            </p>
            <p className="text-[#d1d1d6] leading-relaxed">
              {r2Status.missingVars && r2Status.missingVars.length > 0
                ? `Configure ${r2Status.missingVars.join(', ')} no ambiente do servidor para habilitar o envio de fotos.`
                : r2Status.error || 'Não foi possível conectar ao armazenamento de mídia.'}
            </p>
          </div>
        </div>
      )}

      {/* Studio Composer Card */}
      <section
        aria-label="Publicar novo trabalho"
        className="rounded-[24px] bg-[#1c1c1e] border border-white/[0.08] p-4 sm:p-6"
      >
        <form onSubmit={handlePublishSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Interactive Photo Stage */}
          <div className="lg:col-span-5 flex flex-col">
            <input
              ref={galleryFileRef}
              id="gallery-file-input"
              type="file"
              accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={handleFileInputChange}
              className="sr-only"
            />

            {selectedPreviewUrl ? (
              <div className="relative aspect-[4/3] w-full rounded-[18px] overflow-hidden bg-black border border-white/10 group">
                <img
                  src={selectedPreviewUrl}
                  alt="Prévia do trabalho selecionado"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => galleryFileRef.current?.click()}
                    className="min-h-[38px] px-3 rounded-xl bg-black/70 hover:bg-black text-xs font-medium text-white backdrop-blur-md border border-white/15 inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Trocar</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearStagedFile}
                    aria-label="Remover foto selecionada"
                    className="min-h-[38px] min-w-[38px] rounded-xl bg-black/70 hover:bg-[#3a1615] text-white hover:text-[#ff6961] backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => galleryFileRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const dropped = e.dataTransfer.files?.[0];
                  if (dropped) stageFileForUpload(dropped);
                }}
                className={`aspect-[4/3] w-full rounded-[18px] border border-dashed flex flex-col items-center justify-center gap-2.5 p-5 text-center transition-all active:scale-[0.99] ${
                  isDragging
                    ? 'border-[#e07a68] bg-[#8c1d0e]/15'
                    : 'border-white/15 bg-[#141416] hover:border-white/30 hover:bg-[#19191d]'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-[#2c2c2e] text-[#e07a68] flex items-center justify-center">
                  <ImagePlus className="w-6 h-6" />
                </div>
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-[#f5f5f7]">
                    Selecionar foto do trabalho
                  </div>
                  <div className="text-xs text-[#8e8e93]">
                    Toque ou arraste · PNG, JPG ou WebP até 5 MB
                  </div>
                </div>
              </button>
            )}
          </div>

          {/* Details + Action */}
          <div className="lg:col-span-7 flex flex-col justify-between gap-4">
            <div className="space-y-4">
              <div>
                <h2 className="text-base font-semibold text-[#f5f5f7]">
                  Novo trabalho na galeria
                </h2>
                <p className="text-xs text-[#8e8e93] mt-0.5">
                  Ao substituir ou excluir uma foto, a versão anterior é removida automaticamente.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label htmlFor="gal-title" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Título do trabalho
                  </label>
                  <input
                    id="gal-title"
                    type="text"
                    maxLength={80}
                    value={galleryTitle}
                    onChange={(e) => setGalleryTitle(e.target.value)}
                    placeholder="Ex.: Esmaltação em Gel Bordô"
                    className="w-full h-11 rounded-[14px] bg-[#2c2c2e] border border-transparent focus:border-[#8c1d0e] px-3.5 text-sm text-[#f5f5f7] placeholder-[#636366] focus:outline-none transition-colors"
                  />
                </div>

                <div>
                  <label htmlFor="gal-caption" className="block text-xs font-medium text-[#aeaeb2] mb-1.5">
                    Legenda (opcional)
                  </label>
                  <textarea
                    id="gal-caption"
                    rows={2}
                    maxLength={200}
                    value={galleryCaption}
                    onChange={(e) => setGalleryCaption(e.target.value)}
                    placeholder="Detalhes do resultado, técnica ou acabamento..."
                    className="w-full rounded-[14px] bg-[#2c2c2e] border border-transparent focus:border-[#8c1d0e] px-3.5 py-2.5 text-sm text-[#f5f5f7] placeholder-[#636366] focus:outline-none resize-none transition-colors"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2.5">
              {galleryError && (
                <p role="alert" className="text-xs font-medium text-[#ff453a]">
                  {galleryError}
                </p>
              )}

              <button
                type="submit"
                disabled={uploadingGallery}
                className="w-full h-12 px-5 rounded-[16px] bg-[#8c1d0e] hover:bg-[#a32210] active:scale-[0.99] disabled:opacity-50 text-sm font-semibold text-white inline-flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#8c1d0e]/20"
              >
                <ImagePlus className="w-4 h-4" />
                <span>
                  {uploadingGallery
                    ? 'Publicando na galeria...'
                    : selectedFile
                      ? 'Publicar na galeria'
                      : 'Escolher foto para publicar'}
                </span>
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Hidden input for replacing an existing photo */}
      <input
        ref={replaceFileRef}
        type="file"
        accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
        onChange={(e) => void handleReplaceGalleryPhoto(e)}
        className="sr-only"
      />

      {/* Published Portfolio Grid */}
      <section aria-label="Trabalhos publicados" className="space-y-3.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-base font-semibold text-[#f5f5f7]">
            Trabalhos publicados
          </h2>
          {galleryItems.length > 0 && (
            <span className="text-xs text-[#8e8e93]">
              Toque na foto para ampliar
            </span>
          )}
        </div>

        {galleryItems.length === 0 ? (
          <div className="rounded-[24px] bg-[#1c1c1e] border border-white/[0.08] py-12 px-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#2c2c2e] text-[#8e8e93] flex items-center justify-center mx-auto">
              <Images className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#f5f5f7]">
                Sua galeria ainda está vazia
              </p>
              <p className="text-xs text-[#8e8e93] max-w-sm mx-auto leading-relaxed">
                Adicione fotos dos melhores atendimentos acima para mostrar seu portfólio aos clientes na tela inicial.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {galleryItems.map((item) => {
              const isReplacing = replacingGalleryId === item.id;
              const isDeleting = deletingGalleryId === item.id;
              const dateLabel = formatShortDate(item.createdAt);

              return (
                <article
                  key={item.id}
                  className="rounded-[22px] bg-[#1c1c1e] border border-white/[0.08] overflow-hidden flex flex-col group"
                >
                  <button
                    type="button"
                    onClick={() => setLightboxItem(item)}
                    aria-label={`Ampliar trabalho ${item.title}`}
                    className="relative aspect-[4/3] w-full bg-black overflow-hidden text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#e07a68]"
                  >
                    <img
                      src={item.imageUrl}
                      alt={item.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-70 group-hover:opacity-90 transition-opacity" />
                    <span className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-white flex items-center justify-center">
                      <Expand className="w-4 h-4" />
                    </span>
                  </button>

                  <div className="p-4 flex-1 flex flex-col justify-between gap-3.5">
                    <div className="space-y-1">
                      <h3 className="text-[15px] font-semibold text-[#f5f5f7] leading-snug line-clamp-1">
                        {item.title}
                      </h3>
                      {item.caption && (
                        <p className="text-xs text-[#aeaeb2] leading-relaxed line-clamp-2">
                          {item.caption}
                        </p>
                      )}
                      {dateLabel && (
                        <p className="text-[11px] text-[#636366] pt-0.5 tabular-nums">
                          Publicado em {dateLabel}
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.07]">
                      <button
                        type="button"
                        disabled={isReplacing || isDeleting}
                        onClick={() => {
                          setReplaceTargetItem(item);
                          replaceFileRef.current?.click();
                        }}
                        aria-label={`Trocar foto de ${item.title}`}
                        className="min-h-[42px] px-3 rounded-[13px] bg-[#2c2c2e] hover:bg-[#3a3a3c] active:scale-[0.98] disabled:opacity-50 text-xs font-semibold text-[#f5f5f7] inline-flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Upload className="w-3.5 h-3.5 shrink-0" />
                        <span>{isReplacing ? 'Trocando...' : 'Trocar foto'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isDeleting || isReplacing}
                        onClick={() => void handleDeleteGallery(item)}
                        aria-label={`Excluir trabalho ${item.title}`}
                        className="min-h-[42px] px-3 rounded-[13px] bg-[#3a1615] hover:bg-[#4e1d1b] active:scale-[0.98] disabled:opacity-50 text-xs font-semibold text-[#ff6961] inline-flex items-center justify-center gap-1.5 transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{isDeleting ? 'Excluindo...' : 'Excluir'}</span>
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Lightbox Modal */}
      {lightboxItem && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="w-full sm:max-w-2xl rounded-t-[28px] sm:rounded-[24px] bg-[#1c1c1e] border border-white/10 overflow-hidden shadow-2xl pb-safe"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-black flex items-center justify-center max-h-[68vh]">
              <img
                src={lightboxItem.imageUrl}
                alt={lightboxItem.title}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[68vh] object-contain"
              />
              <button
                type="button"
                onClick={() => setLightboxItem(null)}
                aria-label="Fechar prévia"
                className="absolute top-3 right-3 h-11 w-11 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/15"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-1">
              <h3 className="text-base font-semibold text-[#f5f5f7]">{lightboxItem.title}</h3>
              {lightboxItem.caption && (
                <p className="text-sm text-[#aeaeb2]">{lightboxItem.caption}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
