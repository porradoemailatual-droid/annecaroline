# Security Specification — Esmalteria&beleza Booking & Admin App

## 1. Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied for read and write.
2. **PII Isolation**: Client emails, phone numbers, names, and appointment notes live strictly in `/appointments`, `/clients`, and `/users`. Public schedule availability uses `/busySlots`, which contains zero PII (only date, time, duration, professionalId, kind, and opaque UIDs).
3. **Verified Identity**: All client writes require `request.auth != null && request.auth.token.email_verified == true`.
4. **Admin Authority**: Admin access is granted strictly to the bootstrapped owner email (`porradoemailatual@gmail.com` with `email_verified == true`) or UIDs explicitly listed in `/admins/{uid}`. Users can never self-assign admin status or mutate `/admins`.
5. **Atomicity & Relational Integrity**:
   - Creating a client appointment in `/appointments/{appointmentId}` MUST verify the referenced `/professionals/{professionalId}` exists and atomically create `/busySlots/{appointmentId}` (`existsAfter`) in the same write batch.
   - Appointments created by non-admins must have `userId == request.auth.uid`, initial `status == 'confirmed'` or `'pending'`, and cannot jump directly to `'completed'`.
6. **Terminal State Locking**: Once an appointment is `'completed'` or `'cancelled'`, non-admins cannot alter it. Only admins may override or reopen statuses.
7. **Strict Timestamps & Immutability**: `createdAt == request.time` on create; `updatedAt == request.time` on create and update; `createdAt` and `userId` are immutable on update.
8. **Secure List Queries**: `allow list` on `/appointments` evaluates `resource.data.userId == request.auth.uid || isBootstrappedAdmin()` with zero `get()`/`exists()` calls. `/clients` and `/users` list is restricted to bootstrapped admin only.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Identity Spoofing on Appointment Create**: Authenticated user `uid_attacker` submits `userId: "uid_victim"` to `/appointments/apt_1`. Must be DENIED.
2. **Shadow Field Injection on Appointment Create**: User submits valid appointment plus ghost field `isAdminApproved: true`. Must be DENIED by `keys().hasOnly(...)`.
3. **Unverified Email Spoofing**: Attacker with `email: "porradoemailatual@gmail.com"` and `email_verified: false` attempts to list `/clients`. Must be DENIED.
4. **PII Blanket Read on `/users/{victimId}`**: Non-admin user attempts `get` on another user's profile. Must be DENIED.
5. **PII Blanket List on `/appointments`**: Non-admin user attempts unconstrained `list` of all appointments without `where('userId', '==', uid)`. Must be DENIED.
6. **Self-Assigned Admin Escalation**: Non-admin user tries to create `/admins/{myUid}`. Must be DENIED.
7. **Loyalty Points Tampering**: User updates own `/users/{uid}` trying to increment `loyaltyPoints` from `0` to `999`. Must be DENIED by `affectedKeys().hasOnly(...)`.
8. **Status Shortcutting on Appointment**: Non-admin user creates or updates appointment directly to `status: "completed"`. Must be DENIED.
9. **Terminal State Mutation**: Non-admin user tries to update a `'cancelled'` appointment back to `'confirmed'`. Must be DENIED.
10. **Path ID Poisoning**: Attacker writes to `/appointments/invalid$id@with#spaces` or 200-char ID. Must be DENIED by `isValidId()`.
11. **Value Poisoning / Denial of Wallet**: Attacker submits a 5000-char string in `notes` or 50 elements in `serviceIds`. Must be DENIED by `.size()` bounds.
12. **Client Timestamp Forgery**: User submits a backdated `createdAt` or `updatedAt` instead of `request.time`. Must be DENIED.
