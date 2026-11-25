import React, { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Delete, Lock, ShieldCheck } from 'lucide-react';
import { useBooking } from '../../context/BookingContext';

interface AdminAuthGateProps {
  onBackToSite: () => void;
}

const KEYPAD_ROWS: Array<Array<string>> = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'back'],
];

export function AdminAuthGate({ onBackToSite }: AdminAuthGateProps) {
  const {
    authReady,
    adminCheckingActivation,
    firebaseUser,
    settings,
    signInAdminGoogle,
    verifyAdminPin,
    lockAdminSession,
  } = useBooking();

  const [authError, setAuthError] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState(false);

  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);

  const step: 'login' | 'pin' =
    firebaseUser && firebaseUser.emailVerified ? 'pin' : 'login';

  const handleGoogleSignIn = async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      const result = await signInAdminGoogle();
      if (!result.ok) {
        setAuthError(result.error || 'Não foi possível concluir o login.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  const submitPin = useCallback(
    async (fullPin: string) => {
      setVerifyingPin(true);
      setPinError(null);
      try {
        const res = await verifyAdminPin(fullPin);
        if (!res.ok) {
          setPinError(res.error || 'PIN incorreto.');
          setPin('');
          setShakeKey((k) => k + 1);
        }
      } finally {
        setVerifyingPin(false);
      }
    },
    [verifyAdminPin]
  );

  const handleDigitPress = useCallback(
    (digit: string) => {
      if (verifyingPin) return;
      setPinError(null);
      setPin((prev) => {
        if (prev.length >= 6) return prev;
        const next = prev + digit;
        if (next.length === 6) {
          void submitPin(next);
        }
        return next;
      });
    },
    [submitPin, verifyingPin]
  );

  const handleBackspace = useCallback(() => {
    if (verifyingPin) return;
    setPin((prev) => prev.slice(0, -1));
  }, [verifyingPin]);

  const handleClear = useCallback(() => {
    if (verifyingPin) return;
    setPin('');
    setPinError(null);
  }, [verifyingPin]);

  // Support physical keyboard input on Step 2
  useEffect(() => {
    if (step !== 'pin' || adminCheckingActivation) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigitPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [step, adminCheckingActivation, handleDigitPress, handleBackspace, handleClear]);

  return (
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col px-4 py-6">
      {/* Top Bar */}
      <div className="max-w-5xl w-full mx-auto flex items-center justify-between">
        <button
          type="button"
          onClick={onBackToSite}
          className="inline-flex items-center gap-1 text-sm font-medium text-[#e07a68] hover:text-[#f29584] transition-colors py-2"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Voltar ao site</span>
        </button>

        <div className="flex items-center gap-2 min-w-0">
          {settings.headerLogoUrl && (
            <img
              src={settings.headerLogoUrl}
              alt=""
              className="h-6 w-auto max-w-[72px] object-contain rounded"
            />
          )}
          <span className="text-xs font-medium text-[#8e8e93] truncate">{settings.businessName}</span>
        </div>
      </div>

      {/* Centered iOS Lock Card */}
      <div className="flex-1 flex items-center justify-center py-8">
        <div className="w-full max-w-sm rounded-[28px] bg-[#1c1c1e] border border-white/[0.09] p-7 shadow-2xl space-y-6">
          <div className="text-center space-y-2.5">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[#8c1d0e]/20 border border-[#8c1d0e]/50 flex items-center justify-center text-[#e07a68]">
              {step === 'pin' ? <ShieldCheck className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
            </div>

            <h1 className="text-xl font-semibold text-[#f5f5f7]">
              {step === 'pin' ? 'Ativar acesso com PIN' : 'Área do Profissional'}
            </h1>

            <p className="text-sm text-[#aeaeb2] leading-relaxed">
              {step === 'pin'
                ? 'Primeira vez nesta conta Google. Digite o PIN de 6 dígitos uma única vez — nos próximos acessos você entrará direto.'
                : 'Entre com qualquer conta Google. Somente o PIN libera a ativação do painel administrativo na primeira vez.'}
            </p>
          </div>

          {/* Step Indicator */}
          <div className="flex items-center justify-center gap-2 text-xs text-[#8e8e93]">
            <span className={step === 'login' ? 'text-[#f5f5f7] font-semibold' : 'text-[#30d158]'}>
              1. Conta Google
            </span>
            <span aria-hidden="true">→</span>
            <span className={step === 'pin' ? 'text-[#f5f5f7] font-semibold' : ''}>
              2. PIN (1ª vez)
            </span>
          </div>

          {!authReady || adminCheckingActivation ? (
            <div className="py-8 text-center text-sm text-[#8e8e93]">
              {adminCheckingActivation ? 'Verificando ativação da conta...' : 'Verificando sessão...'}
            </div>
          ) : step === 'login' ? (
            <div className="space-y-4">
              {authError && (
                <div
                  role="alert"
                  className="rounded-2xl bg-[#3a1615] border border-[#ff453a]/30 p-3.5 text-xs text-[#ff8a80] leading-relaxed"
                >
                  {authError}
                </div>
              )}

              <button
                type="button"
                disabled={signingIn}
                onClick={() => void handleGoogleSignIn()}
                className="w-full h-12 rounded-2xl bg-[#8c1d0e] hover:bg-[#a32210] active:scale-[0.99] disabled:opacity-50 text-white text-sm font-semibold transition-all"
              >
                {signingIn ? 'Conectando...' : 'Entrar com Google'}
              </button>

              <p className="text-center text-[11px] text-[#636366] leading-relaxed">
                Já ativou sua conta antes? Basta entrar com o Google para abrir o painel direto.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Authenticated Google Account Bar */}
              <div className="flex items-center justify-between gap-2 rounded-2xl bg-[#2c2c2e]/70 px-3.5 py-2.5 text-xs">
                <span className="text-[#d1d1d6] truncate">{firebaseUser?.email}</span>
                <button
                  type="button"
                  onClick={() => void lockAdminSession()}
                  className="text-[#e07a68] hover:text-white font-medium shrink-0"
                >
                  Trocar
                </button>
              </div>

              {/* 6-Dot PIN Display */}
              <div
                key={shakeKey}
                className={`flex items-center justify-center gap-3.5 py-2 ${
                  shakeKey > 0 ? 'animate-ios-shake' : ''
                }`}
                aria-label={`${pin.length} de 6 dígitos informados`}
              >
                {Array.from({ length: 6 }).map((_, idx) => {
                  const filled = idx < pin.length;
                  return (
                    <span
                      key={idx}
                      className={`w-3.5 h-3.5 rounded-full border transition-all duration-150 ${
                        filled
                          ? 'bg-[#f5f5f7] border-[#f5f5f7] scale-110'
                          : 'bg-transparent border-[#636366]'
                      }`}
                    />
                  );
                })}
              </div>

              {pinError && (
                <p role="alert" className="text-center text-xs font-medium text-[#ff453a]">
                  {pinError}
                </p>
              )}

              {verifyingPin && (
                <p className="text-center text-xs text-[#aeaeb2]">Validando PIN...</p>
              )}

              {/* iOS Lock-Screen Numeric Keypad */}
              <div className="grid grid-cols-3 gap-3 max-w-[248px] mx-auto pt-1">
                {KEYPAD_ROWS.flat().map((key) => {
                  if (key === 'clear') {
                    return (
                      <button
                        key="clear"
                        type="button"
                        disabled={verifyingPin || pin.length === 0}
                        onClick={handleClear}
                        aria-label="Limpar PIN"
                        className="h-16 rounded-full text-xs font-medium text-[#aeaeb2] hover:text-white active:bg-[#2c2c2e] disabled:opacity-35 transition-colors flex items-center justify-center"
                      >
                        Limpar
                      </button>
                    );
                  }
                  if (key === 'back') {
                    return (
                      <button
                        key="back"
                        type="button"
                        disabled={verifyingPin || pin.length === 0}
                        onClick={handleBackspace}
                        aria-label="Apagar último dígito"
                        className="h-16 rounded-full text-[#f5f5f7] hover:bg-[#2c2c2e] active:scale-95 disabled:opacity-35 transition-all flex items-center justify-center"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={verifyingPin}
                      onClick={() => handleDigitPress(key)}
                      aria-label={`Dígito ${key}`}
                      className="h-16 w-16 mx-auto rounded-full bg-[#2c2c2e] hover:bg-[#3a3a3c] active:bg-[#8c1d0e] active:scale-95 text-2xl font-medium text-[#f5f5f7] tabular-nums transition-all flex items-center justify-center"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
