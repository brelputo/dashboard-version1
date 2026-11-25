window.__build = window.__build || {}; window.__build['vault.js'] = '2026-11-25-o';
/* VAULT: sign-in, encryption, cloud sync (Supabase), lock/unlock, backups and import.
   Part of the Financial Movement Dashboard. Plain script (not a module): functions here are shared with the other js files. */

    function bytesToB64(buf) {
        const b = new Uint8Array(buf);
        let out = '';
        for (let i = 0; i < b.length; i += 0x8000) out += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
        return btoa(out);
    }
    function b64ToBytes(str) {
        const bin = atob(str);
        const b = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
        return b;
    }
    async function deriveVaultKey(passphrase, salt) {
        const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
            base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
        );
    }
    async function encryptVault(obj) {
        const json = JSON.stringify(obj);
        if (!hasSubtle()) return CryptoJS.AES.encrypt(json, masterKey).toString();
        if (!vaultKey) {
            vaultSalt = crypto.getRandomValues(new Uint8Array(16));
            vaultKey = await deriveVaultKey(masterKey, vaultSalt);
        }
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, new TextEncoder().encode(json));
        const out = new Uint8Array(16 + 12 + ct.byteLength);
        out.set(vaultSalt, 0);
        out.set(iv, 16);
        out.set(new Uint8Array(ct), 28);
        return VAULT_PREFIX + bytesToB64(out);
    }

    async function decryptVault(str) {
        if (str.startsWith(VAULT_PREFIX)) {
            const raw = b64ToBytes(str.slice(VAULT_PREFIX.length));
            const salt = raw.slice(0, 16), iv = raw.slice(16, 28), ct = raw.slice(28);
            const key = await deriveVaultKey(masterKey, salt);
            let plain;
            try {
                plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
            } catch (_) {
                throw new Error('Incorrect master passphrase or corrupted vault data.');
            }
            vaultKey = key;
            vaultSalt = salt;
            return JSON.parse(new TextDecoder().decode(plain));
        }
        let text = '';
        try { text = CryptoJS.AES.decrypt(str, masterKey).toString(CryptoJS.enc.Utf8); } catch (_) { }
        if (!text) throw new Error('Incorrect master passphrase or unreadable vault data.');
        return JSON.parse(text);
    }

    function resetIdleTimer() {
        clearTimeout(idleTimer);
        if (!masterKey) return;
        idleTimer = setTimeout(() => { lockVault(); }, IDLE_MS);
    }
    function showLoginError(msg) {
        const el = document.getElementById('login-error');
        el.textContent = msg;
        el.style.display = 'block';
        const form = document.getElementById('pl-form');
        if (form) { form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake'); }
        const inf = document.getElementById('login-info'); if (inf) inf.style.display = 'none';
    }
    function setLoginBusy(busy) {
        const btn = document.getElementById('unlock-btn');
        btn.disabled = busy;
        btn.classList.toggle('busy', busy);
        btn.setAttribute('aria-label', busy ? 'Unlocking' : 'Unlock');
        if (busy) document.getElementById('login-error').style.display = 'none';
    }
    function capsCheck(e) {
        const on = !!(e.getModifierState && e.getModifierState('CapsLock'));
        document.getElementById('pl-caps').classList.toggle('show', on);
    }
    function updateLockClock() {
        const o = document.getElementById('login-overlay');
        if (!o || o.style.display === 'none') return;
        const n = new Date();
        const hm = n.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        const sec = n.toLocaleTimeString('en-AU', { second: '2-digit' }).padStart(2, '0');
        document.getElementById('pl-time').innerHTML = esc(hm) + `<span class="sec">${esc(sec)}</span>`;
        document.getElementById('pl-date').innerText = n.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
        const h = n.getHours();
        const greet = h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
        const g = document.getElementById('pl-greet');
        if (g && g.innerText !== greet) g.innerText = greet;
    }
    function showLoginPanel(name) {
        const map = { login: 'login-panel', forgot: 'forgot-panel', recovery: 'recovery-panel' };
        Object.keys(map).forEach(k => { document.getElementById(map[k]).hidden = (k !== name); });
        ['login-error', 'login-info'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
        if (name === 'forgot') {
            document.getElementById('reset-email').value = document.getElementById('acct-email').value.trim();
            document.getElementById('reset-email').focus();
        } else if (name === 'recovery') {
            document.getElementById('new-pwd').focus();
        }
    }
    function setLoginInfo(msg, isError) {
        const info = document.getElementById('login-info'), err = document.getElementById('login-error');
        const el = isError ? err : info;
        (isError ? info : err).style.display = 'none';
        el.textContent = msg; el.style.display = 'block';
    }

    async function sendResetLink() {
        const email = document.getElementById('reset-email').value.trim();
        const btn = document.getElementById('reset-btn');
        if (!email) { setLoginInfo('Enter your account email.', true); return; }
        if (location.protocol === 'file:') {
            setLoginInfo('This page is opened as a file on your computer, so a reset link cannot come back to it. Open the dashboard from its web address, or reset the password in your Supabase dashboard (Authentication, then Users).', true);
            return;
        }
        if (!authClient) { setLoginInfo('The cloud library did not load. Reload the page and try again.', true); return; }
        btn.disabled = true;
        try {
            const { error } = await authClient.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
            if (error) throw error;
            setLoginInfo('If an account exists for that email, a reset link is on its way. Open it in this same browser.', false);
        } catch (e) {
            setLoginInfo(/rate|seconds|too many/i.test(e.message || '') ? 'Too many requests. Wait a minute and try again.' : (e.message || 'Could not send the reset email.'), true);
        } finally { btn.disabled = false; }
    }

    async function submitNewPassword() {
        const p1 = document.getElementById('new-pwd').value, p2 = document.getElementById('new-pwd2').value;
        const btn = document.getElementById('recovery-btn');
        if (p1.length < 8) { setLoginInfo('Use at least 8 characters.', true); return; }
        if (p1 !== p2) { setLoginInfo('The two passwords do not match.', true); return; }
        btn.disabled = true;
        try {
            const { error } = await authClient.auth.updateUser({ password: p1 });
            if (error) throw error;
            try { await authClient.auth.signOut({ scope: 'local' }); } catch (_) { }
            try { history.replaceState(null, '', location.pathname); } catch (_) { }
            document.getElementById('new-pwd').value = ''; document.getElementById('new-pwd2').value = '';
            showLoginPanel('login');
            setLoginInfo('Password updated. Sign in with your new password.', false);
        } catch (e) {
            setLoginInfo(e.message || 'Could not update the password. Open the reset link again.', true);
        } finally { btn.disabled = false; }
    }

    // ----- Security dialog -----
    function secMsg(id, text, ok) {
        const el = document.getElementById(id);
        el.className = 'sec-msg ' + (text ? (ok ? 'ok' : 'err') : '');
        el.textContent = text || '';
    }
    function openSecurityModal() {
        ['sp-old', 'sp-new', 'sp-new2', 'ap-old', 'ap-new', 'ap-new2'].forEach(id => { document.getElementById(id).value = ''; });
        secMsg('sp-msg', ''); secMsg('ap-msg', '');
        document.getElementById('security-modal').style.display = 'flex';
        document.getElementById('sp-old').focus();
    }
    function closeSecurityModal() {
        const m = document.getElementById('security-modal');
        if (m) m.style.display = 'none';
        ['sp-old', 'sp-new', 'sp-new2', 'ap-old', 'ap-new', 'ap-new2'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    }

    async function changeVaultPassphrase() {
        if (changingPass) return;
        const oldP = document.getElementById('sp-old').value.trim();
        const newP = document.getElementById('sp-new').value.trim();
        const newP2 = document.getElementById('sp-new2').value.trim();
        if (!supabaseClient || !masterKey) { secMsg('sp-msg', 'Your session ended. Sign in again.'); return; }
        if (oldP !== masterKey) { secMsg('sp-msg', 'The current passphrase is not correct.'); return; }
        if (newP.length < 10) { secMsg('sp-msg', 'Use at least 10 characters for the new passphrase.'); return; }
        if (newP === oldP) { secMsg('sp-msg', 'The new passphrase must be different.'); return; }
        if (newP !== newP2) { secMsg('sp-msg', 'The two new passphrases do not match.'); return; }
        changingPass = true;
        const btn = document.getElementById('sp-btn');
        btn.disabled = true;
        const prev = { masterKey, vaultKey, vaultSalt };
        try {
            secMsg('sp-msg', 'Working... do not close this page.', true);
            // finish any pending save with the OLD passphrase first, so nothing is lost
            for (let i = 0; i < 100 && (saveTimer || saving); i++) {
                if (saving) await new Promise(r => setTimeout(r, 100)); else await saveNow();
            }
            if (document.getElementById('sp-backup').checked) exportJSON();

            const client = supabaseClient;
            const { data, error: fetchErr } = await client.from('user_finances').select('id, encrypted_data').order('created_at', { ascending: false }).limit(1);
            if (fetchErr) throw fetchErr;
            if (data && data.length && lastSyncedCipher !== null && data[0].encrypted_data !== lastSyncedCipher) {
                throw new Error('This vault was changed on another device. Use Sync to load the latest version, then try again.');
            }
            masterKey = newP; vaultKey = null; vaultSalt = null;          // new key + new random salt
            const encrypted = await encryptVault(buildVaultPayload());
            const check = await decryptVault(encrypted);                   // prove the new passphrase opens it before saving
            if (!check || !(check.datasets || check)) throw new Error('Verification failed.');
            let res;
            if (data && data.length) res = await client.from('user_finances').update({ encrypted_data: encrypted }).eq('id', data[0].id);
            else res = await client.from('user_finances').insert([{ encrypted_data: encrypted }]);
            if (res.error) throw res.error;
            lastSyncedCipher = encrypted;
            secMsg('sp-msg', 'Done. Your vault now uses the new passphrase. Use it the next time you sign in.', true);
            ['sp-old', 'sp-new', 'sp-new2'].forEach(id => { document.getElementById(id).value = ''; });
            showToast('Vault passphrase changed');
        } catch (e) {
            masterKey = prev.masterKey; vaultKey = prev.vaultKey; vaultSalt = prev.vaultSalt;   // nothing changed in the cloud
            secMsg('sp-msg', 'Not changed: ' + (e.message || e) + ' Your old passphrase still works.');
        } finally {
            btn.disabled = false;
            changingPass = false;
        }
    }

    async function changeAccountPassword() {
        const oldP = document.getElementById('ap-old').value;
        const p1 = document.getElementById('ap-new').value, p2 = document.getElementById('ap-new2').value;
        if (!authClient || !activeAcctEmail) { secMsg('ap-msg', 'Your session ended. Sign in again.'); return; }
        if (!oldP) { secMsg('ap-msg', 'Enter your current account password.'); return; }
        if (p1.length < 8) { secMsg('ap-msg', 'Use at least 8 characters for the new password.'); return; }
        if (p1 === oldP) { secMsg('ap-msg', 'The new password must be different.'); return; }
        if (p1 !== p2) { secMsg('ap-msg', 'The two new passwords do not match.'); return; }
        const btn = document.getElementById('ap-btn');
        btn.disabled = true;
        try {
            const { error: reErr } = await authClient.auth.signInWithPassword({ email: activeAcctEmail, password: oldP });
            if (reErr) throw new Error('The current account password is not correct.');
            const { error } = await authClient.auth.updateUser({ password: p1 });
            if (error) throw error;
            ['ap-old', 'ap-new', 'ap-new2'].forEach(id => { document.getElementById(id).value = ''; });
            secMsg('ap-msg', 'Account password changed. Use it the next time you sign in.', true);
            showToast('Account password changed');
        } catch (e) {
            secMsg('ap-msg', e.message || String(e));
        } finally { btn.disabled = false; }
    }

    async function reloadFromCloud() {
        await fetchAndDecryptCloudData();
        ensureYearDatasetsExist(selectedYear);
        document.getElementById('budget-rollover-toggle').checked = enableBudgetRollover;
        syncRolloverBalances();
        sortTransactions();
        renderApp();
    }

    function buildVaultPayload() {
        captureActiveAccount();
        return { accounts, activeAccountId, lastBackup: backupLastMs() };
    }

    function markBackupDone(noSync) {
        vaultLastBackup = Date.now();
        try { localStorage.setItem('dashboard_last_backup', String(vaultLastBackup)); localStorage.removeItem('dashboard_backup_snooze'); } catch (_) { }
        if (typeof updateBackupUi === 'function') updateBackupUi(true);
        if (!noSync && masterKey && typeof saveToSupabase === 'function') saveToSupabase();   // so your other browsers learn about it too
    }

    /* ---------- tiny ZIP maker/reader (no outside library) ---------- */
    const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
    function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    async function pipeBytes(bytes, transform) {
        return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(transform)).arrayBuffer());
    }
    async function makeZip(fileName, text) {
        const data = new TextEncoder().encode(text);
        let comp = data, method = 0;
        if (typeof CompressionStream !== 'undefined') {
            try { comp = await pipeBytes(data, new CompressionStream('deflate-raw')); method = 8; } catch (_) { comp = data; method = 0; }
        }
        const name = new TextEncoder().encode(fileName);
        const d = new Date();
        const dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
        const crc = crc32(data);
        const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
        lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0, true); lv.setUint16(8, method, true);
        lv.setUint16(10, dosTime, true); lv.setUint16(12, dosDate, true); lv.setUint32(14, crc, true);
        lv.setUint32(18, comp.length, true); lv.setUint32(22, data.length, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
        local.set(name, 30);
        const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
        cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0, true); cv.setUint16(10, method, true);
        cv.setUint16(12, dosTime, true); cv.setUint16(14, dosDate, true); cv.setUint32(16, crc, true);
        cv.setUint32(20, comp.length, true); cv.setUint32(24, data.length, true); cv.setUint16(28, name.length, true);
        cv.setUint32(42, 0, true);
        central.set(name, 46);
        const cdOffset = local.length + comp.length;
        const end = new Uint8Array(22), ev = new DataView(end.buffer);
        ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, 1, true); ev.setUint16(10, 1, true);
        ev.setUint32(12, central.length, true); ev.setUint32(16, cdOffset, true);
        return new Blob([local, comp, central, end], { type: 'application/zip' });
    }
    async function readZipText(arrayBuffer) {
        const u = new Uint8Array(arrayBuffer), v = new DataView(arrayBuffer);
        let e = -1;
        for (let i = u.length - 22; i >= Math.max(0, u.length - 70000); i--) { if (v.getUint32(i, true) === 0x06054b50) { e = i; break; } }
        if (e < 0) throw new Error('not a zip');
        const cd = v.getUint32(e + 16, true);
        if (v.getUint32(cd, true) !== 0x02014b50) throw new Error('bad zip');
        const method = v.getUint16(cd + 10, true), csize = v.getUint32(cd + 20, true), lho = v.getUint32(cd + 42, true);
        if (v.getUint32(lho, true) !== 0x04034b50) throw new Error('bad zip');
        const start = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
        let bytes = u.slice(start, start + csize);
        if (method === 8) bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
        else if (method !== 0) throw new Error('unsupported zip');
        return new TextDecoder().decode(bytes);
    }

    /* ---------- weekly backup: zipped, encrypted ---------- */
    const BACKUP_EVERY_DAYS = 7;
    async function exportEncryptedBackup() {
        if (!masterKey) { showToast('Unlock the vault first', true); return; }
        try {
            const cipher = await encryptVault(buildVaultPayload());
            const blob = await makeZip(`finance_backup_encrypted_${isoDate(new Date())}.enc`, cipher);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'finance-backup.zip';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1500);
            markBackupDone();
            showToast('Backup downloaded (zip, encrypted)');
        } catch (e) {
            showToast('Backup failed: ' + (e.message || e), true);
        }
    }
    function backupLastMs() { let l = 0; try { l = parseInt(localStorage.getItem('dashboard_last_backup') || '0', 10) || 0; } catch (_) { } return Math.max(l, vaultLastBackup || 0); }
    function backupDue() { const l = backupLastMs(); return !l || (Date.now() - l) >= BACKUP_EVERY_DAYS * 86400000; }
    let backupDoneTimer = null;
    function updateBackupUi(justDone) {
        const bar = document.getElementById('backup-bar'), dot = document.getElementById('backup-dot'), btn = document.getElementById('backup-btn');
        if (!bar || !dot) return;
        const unlocked = !!masterKey, due = backupDue();
        dot.className = 'sync-status backup-dot' + (unlocked && due ? ' due' : '');
        if (btn) btn.title = unlocked ? (due ? 'Your weekly backup is ready - click to download' : 'Backup done ' + isoDate(new Date(backupLastMs())) + ' - click to download a new one') : 'Backup';
        let snooze = 0; try { snooze = parseInt(localStorage.getItem('dashboard_backup_snooze') || '0', 10) || 0; } catch (_) { }
        clearTimeout(backupDoneTimer);
        if (!unlocked) { bar.style.display = 'none'; return; }
        if (justDone === true) {
            bar.className = 'backup-bar done';
            bar.innerHTML = '<span class="backup-ok"></span><span>Backup done. Your next one will be ready in 7 days.</span>';
            bar.style.display = 'flex';
            backupDoneTimer = setTimeout(() => { bar.style.display = 'none'; }, 7000);
        } else if (due && Date.now() >= snooze) {
            const l = backupLastMs();
            const days = l ? Math.floor((Date.now() - l) / 86400000) : null;
            bar.className = 'backup-bar due';
            bar.innerHTML = '<span class="backup-ok"></span><span>Your backup is ready for download' + (days === null ? ' (none made yet).' : ' (last one was ' + days + ' days ago).') + '</span>'
                + '<button type="button" class="backup-go" onclick="exportEncryptedBackup()">Download</button>'
                + '<button type="button" class="backup-later" onclick="snoozeBackup()">Later</button>';
            bar.style.display = 'flex';
        } else { bar.style.display = 'none'; }
    }
    function snoozeBackup() {
        try { localStorage.setItem('dashboard_backup_snooze', String(Date.now() + 12 * 3600000)); } catch (_) { }
        updateBackupUi();
    }
    function checkBackupReminder() { updateBackupUi(); }
    setInterval(() => { if (masterKey) updateBackupUi(); }, 10 * 60 * 1000);

    async function initSession() {
        if (unlocking) return;
        const acctEmail = document.getElementById('acct-email').value.trim();
        const acctPwd = document.getElementById('acct-pwd').value;
        const passphrase = document.getElementById('master-pwd').value.trim();
        if (!acctEmail || !acctPwd) { showLoginError('Enter your account email and account password.'); return; }
        if (!passphrase) { showLoginError('Enter your vault passphrase.'); return; }
        if (!authClient) { showLoginError('The cloud library did not load. Check your internet connection and reload the page.'); return; }
        masterKey = passphrase;
        unlocking = true;
        let signedIn = false;
        const goBtn = document.getElementById('unlock-btn');
        try {
            setLoginBusy(true);
            const { error: authErr } = await authClient.auth.signInWithPassword({ email: acctEmail, password: acctPwd });
            if (authErr) throw new Error(/invalid login/i.test(authErr.message) ? 'Wrong account email or password.' : authErr.message);
            signedIn = true;
            supabaseClient = authClient;
            activeAcctEmail = acctEmail;
            await fetchAndDecryptCloudData();
            try { localStorage.setItem('dashboard_acct_email', acctEmail); } catch (_) { }
            document.getElementById('acct-pwd').value = '';
            document.getElementById('master-pwd').value = '';
            goBtn.classList.remove('busy');
            goBtn.classList.add('success');
            document.body.classList.remove('locked');
            document.getElementById('main-app').style.display = 'block';
            const lockEl = document.getElementById('login-overlay');
            lockEl.classList.add('leaving');
            setTimeout(() => {
                if (!masterKey) return;
                lockEl.style.display = 'none';
                lockEl.classList.remove('leaving');
                goBtn.classList.remove('success');
            }, 520);
            selectedYear = getCurrentYearString();
            document.getElementById('year-dropdown').value = selectedYear;
            ensureYearDatasetsExist(selectedYear);
            selectedMonthName = rawMonthNames[new Date().getMonth()];
            lastMonthName = selectedMonthName;
            document.getElementById('month-dropdown').value = selectedMonthName;
            activeMonthKey = selectedMonthName + selectedYear;
            document.getElementById('budget-rollover-toggle').checked = enableBudgetRollover;
            populateRecurringCategoryDropdown();
            const autoAdded = autoApplyRecurringDue();
            showView('dashboard');
            resetIdleTimer();
            setSyncStatus('');
            const dueNow = collectDueSoon(dueWindowDays);
            if (dueNow.length) {
                const lateN = dueNow.filter(x => x.late).length;
                const dueTotal = dueNow.reduce((a, x) => a + Math.abs(x.amount), 0);
                showToast(`⚠ ${dueNow.length} bill${dueNow.length === 1 ? '' : 's'} due soon (${fmt(dueTotal)})${lateN ? ` · ${lateN} overdue` : ''}`, false, { label: 'Review', fn: () => showView('dashboard') });
            } else {
                showToast(autoAdded ? `Vault unlocked · added ${autoAdded} recurring bill${autoAdded === 1 ? '' : 's'} due` : "Vault unlocked & synced");
            }
            updateBackupUi();
            setTimeout(() => {
                if (!masterKey) return;
                if (toastHasAction()) setTimeout(() => { if (masterKey) checkBackupReminder(); }, 8500);
                else checkBackupReminder();
            }, 3500);
        } catch (e) {
            try { if (signedIn) await authClient.auth.signOut({ scope: 'local' }); } catch (_) { }
            supabaseClient = null;
            masterKey = '';
            vaultKey = null;
            vaultSalt = null;
            goBtn.classList.remove('success');
            showLoginError(signedIn ? 'Could not unlock: ' + e.message : e.message);
        } finally {
            setLoginBusy(false);
            unlocking = false;
        }
    }

    async function refreshFromCloud() {
        if (!supabaseClient || !masterKey) {
            alert('Session expired. Please log in again.');
            return;
        }
        if ((saveTimer || saving) && !confirm('You have changes that are still saving. Reload from the cloud anyway?')) return;
        try {
            await reloadFromCloud();
            setSyncStatus('');
            showToast("Refreshed & synced from cloud!");
        } catch (e) {
            showToast('Refresh failed: ' + e.message, true);
        }
    }

    async function testDatabaseConnection() {
        if (!supabaseClient) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        }
        try {
            const startTime = performance.now();
            const { data, error } = await supabaseClient.from('user_finances').select('id').limit(1);
            const endTime = performance.now();
            const latency = Math.round(endTime - startTime);
            if (error) throw error;
            showToast(`DB Connection Successful! (${latency}ms)`);
            alert(`Database Connection Test Passed successfully!\nLatency: ${latency}ms`);
        } catch (e) {
            alert('DB Connection Test Failed: ' + e.message);
        }
    }

    function normalizeVault() {
        if (!datasets || typeof datasets !== 'object') datasets = {};
        Object.keys(datasets).forEach(k => {
            const ds = datasets[k];
            if (!ds || typeof ds !== 'object') { delete datasets[k]; return; }
            if (!Array.isArray(ds.data)) ds.data = [];
            ds.data = ds.data.filter(t => t && typeof t === 'object');
            ds.data.forEach(t => {
                ['date', 'desc', 'cost', 'creditCat', 'type', 'method'].forEach(f => { t[f] = t[f] == null ? '' : String(t[f]); });
                t.paid = (t.paid == null || t.paid === '') ? 'NO' : String(t.paid);
                t.credit = parseFloat(t.credit) || 0;
                t.debit = parseFloat(t.debit) || 0;
            });
        });
        if (!Array.isArray(categories)) categories = [];
        if (!Array.isArray(creditCategories)) creditCategories = [];
        if (!Array.isArray(recurringTemplates)) recurringTemplates = [];
        recurringTemplates = recurringTemplates.filter(t => t && typeof t === 'object');
        if (!recurringApplied || typeof recurringApplied !== 'object' || Array.isArray(recurringApplied)) recurringApplied = {};
        if (!categoryBudgets || typeof categoryBudgets !== 'object') categoryBudgets = {};
        if (!autoCategorizationMap || typeof autoCategorizationMap !== 'object') autoCategorizationMap = {};
    }

    async function fetchAndDecryptCloudData() {
        const { data, error } = await supabaseClient
            .from('user_finances')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);
        if (error) throw error;
        if (data && data.length > 0 && data[0].encrypted_data) {
            const stored = data[0].encrypted_data;
            const parsedVault = await decryptVault(stored);
            lastSyncedCipher = stored;
            loadAccountsFromVault(parsedVault);
            normalizeVault();
            if (!stored.startsWith(VAULT_PREFIX) && hasSubtle()) saveToSupabase();
        } else {
            await saveNow();
        }
    }

    async function lockVault() {
        setTimeout(() => { if (typeof updateBackupUi === 'function') updateBackupUi(); }, 0);
        for (let i = 0; i < 100 && (saveTimer || saving); i++) {
            if (saving) await new Promise(r => setTimeout(r, 100));
            else await saveNow();
        }
        clearTimeout(idleTimer);
        closeAllModals();
        closeSidebar();
        try { if (supabaseClient) await supabaseClient.auth.signOut({ scope: 'local' }); } catch (_) { }
        supabaseClient = null;
        masterKey = '';
        lastSyncedCipher = null;
        setSyncStatus('');
        document.body.classList.add('locked');
        activeAcctEmail = '';
        try { showLoginPanel('login'); } catch (_) { }
        vaultKey = null;
        vaultSalt = null;
        vaultLastBackup = 0;
        datasets = {};
        accounts = [];
        activeAccountId = '';
        selectedTx.clear();
        autoApplyRecurring = false;
        recurringApplied = {};
        savingsGoals = [];
        investGoal = { target: 0, date: '' };
        subscriptions = [];
        subCandidates = [];
        document.querySelectorAll('#main-app tbody, #main-app tfoot, #goals-list, #forecast-chart, #forecast-tbody, #subs-tbody, #subs-suggestions, #mv-body, #cmp-body, #budgets-grid, #ov-due, #tx-due, #global-results, #ov-upcoming, #ov-goals, #ov-alerts, #print-report').forEach(el => { el.innerHTML = ''; });
        document.getElementById('search-input').value = '';
        document.getElementById('main-app').style.display = 'none';
        document.getElementById('login-overlay').classList.remove('leaving');
        document.getElementById('login-overlay').style.display = '';
        document.querySelectorAll('.pl-anim').forEach(el => {
            el.style.animation = 'none';
            void el.offsetWidth;
            el.style.animation = '';
        });
        updateLockClock();
        ['acct-pwd', 'master-pwd'].forEach(id => {
            const inp = document.getElementById(id);
            inp.value = '';
            if (inp.type !== 'password') togglePasswordVisibility(id);   // hide it again and reset the eye icon
        });
        const em = document.getElementById('acct-email');
        setTimeout(() => (em.value ? document.getElementById('acct-pwd') : em).focus(), 60);
    }

    function saveToSupabase() {
        reconcileTransfers();   // every change keeps linked transfers in step straight away
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveNow, 700);
        if (masterKey) setSyncStatus('saving');
    }

    async function saveNow() {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (!supabaseClient || !masterKey) return;
        if (saving) { saveToSupabase(); return; }
        saving = true;
        const client = supabaseClient;
        try {
            const vaultPayload = buildVaultPayload();
            const encryptedString = await encryptVault(vaultPayload);
            const { data, error: fetchError } = await client
                .from('user_finances')
                .select('id, encrypted_data')
                .order('created_at', { ascending: false })
                .limit(1);
            if (fetchError) throw fetchError;
            if (data && data.length > 0 && lastSyncedCipher !== null && data[0].encrypted_data !== lastSyncedCipher) {
                const overwrite = confirm(
                    'This vault was changed on another device since you last synced.\n\n' +
                    'OK = overwrite the cloud with THIS device\'s data\n' +
                    'Cancel = discard your recent edits here and load the cloud version'
                );
                if (!overwrite) {
                    await reloadFromCloud();
                    showToast('Loaded the latest cloud version');
                    return;
                }
            }
            let result;
            if (data && data.length > 0) {
                result = await client.from('user_finances').update({ encrypted_data: encryptedString }).eq('id', data[0].id);
            } else {
                result = await client.from('user_finances').insert([{ encrypted_data: encryptedString }]);
            }
            if (result.error) throw result.error;
            lastSyncedCipher = encryptedString;
            setSyncStatus('');
        } catch (e) {
            console.error('Cloud save failed:', e);
            setSyncStatus('error');
            showToast('⚠️ Cloud save failed: ' + (e.message || e), true);
        } finally {
            saving = false;
        }
    }

    function exportJSON() {
        if (!confirm('This backup file is NOT encrypted.\n\nAnyone who gets this file can read all of your finances. The Encrypted Backup is safer.\n\nPress OK to download the readable file anyway, or Cancel to stop.')) return;
        const vaultPayload = buildVaultPayload();
        const blob = new Blob([JSON.stringify(vaultPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.href = url;
        downloadAnchor.download = `finance_backup_${selectedYear}.json`;
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        markBackupDone(true);
        showToast("Backup downloaded successfully");
    }

    function importJSON(event) {
        const input = event.target;
        const file = input.files[0];
        if (!file) return;
        const isZip = /\.zip$/i.test(file.name);
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                let raw;
                if (isZip) { try { raw = (await readZipText(e.target.result)).trim(); } catch (_) { throw new Error('Invalid zip'); } }
                else raw = String(e.target.result || '').trim();
                let imported;
                try {
                    imported = JSON.parse(raw);
                } catch (_) {
                    try { imported = await decryptVault(raw); }
                    catch (err) { throw new Error('encrypted: ' + err.message); }
                }
                if (!imported || typeof imported !== 'object') throw new Error('not an object');
                if (Array.isArray(imported.accounts) && imported.accounts.length) {
                    loadAccountsFromVault(imported);
                    ensureYearDatasetsExist(selectedYear);
                    document.getElementById('budget-rollover-toggle').checked = enableBudgetRollover;
                    sortTransactions(); saveToSupabase(); updateAccountUi(); showView(currentView === 'accounts' ? 'dashboard' : currentView);
                    showToast('Successfully restored all accounts from backup & synced!');
                    return;
                }
                const looksLikeMonths = o => o && typeof o === 'object' && Object.values(o).some(v => v && Array.isArray(v.data));
                const incomingDatasets = imported.categories && imported.datasets ? imported.datasets : imported;
                if (!looksLikeMonths(incomingDatasets)) throw new Error('no month data found');
                if (imported.categories && imported.datasets) {
                    categories = imported.categories;
                    creditCategories = imported.creditCategories || creditCategories;
                    datasets = imported.datasets;
                    categoryBudgets = imported.categoryBudgets || {};
                    enableBudgetRollover = imported.enableBudgetRollover || false;
                    recurringTemplates = imported.recurringTemplates || recurringTemplates;
                    autoCategorizationMap = imported.autoCategorizationMap || autoCategorizationMap;
                    savingsGoals = Array.isArray(imported.savingsGoals) ? imported.savingsGoals : savingsGoals;
                    if (imported.investGoal) investGoal = cleanInvestGoal(imported.investGoal);
                    subscriptions = Array.isArray(imported.subscriptions) ? imported.subscriptions : subscriptions;
                    autoApplyRecurring = !!imported.autoApplyRecurring;
                    recurringApplied = (imported.recurringApplied && typeof imported.recurringApplied === 'object') ? imported.recurringApplied : {};
                } else {
                    datasets = imported;
                }
                normalizeVault();
                ensureYearDatasetsExist(selectedYear);
                document.getElementById('budget-rollover-toggle').checked = enableBudgetRollover;
                sortTransactions();
                saveToSupabase();
                renderApp();
                showToast("Successfully restored from backup & synced!");
            } catch (err) {
                alert(/^encrypted:/.test(String(err && err.message))
                    ? 'This encrypted backup could not be opened. It has to be opened with the same password it was created with.'
                    : 'Invalid backup file format.');
            }
        };
        if (isZip) reader.readAsArrayBuffer(file); else reader.readAsText(file);
        input.value = '';
    }
