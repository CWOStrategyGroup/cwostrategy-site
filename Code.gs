/**
 * ════════════════════════════════════════════════════════════════
 *  CWO Strategy Group — Google Apps Script Backend (Code.gs)
 *  Version: 2.1  |  Last updated: 2025
 * ════════════════════════════════════════════════════════════════
 *
 *  ── FIRST-TIME SETUP ──────────────────────────────────────────
 *
 *  1. SPREADSHEET
 *     • Create a new Google Sheet (or use an existing one).
 *     • Copy the Sheet ID from its URL and paste it into SPREADSHEET_ID below.
 *       URL format: docs.google.com/spreadsheets/d/[SHEET_ID]/edit
 *
 *  2. CONFIG CONSTANTS  (edit the block below)
 *     • ADMIN_EMAIL         → your own email address (used for admin login + notifications)
 *     • SITE_URL            → your live website URL, no trailing slash
 *     • ADMIN_TOKEN         → any long random secret string (e.g. a UUID)
 *       ⚠ Keep this private — it authorises every admin API call.
 *
 *  3. ADMIN PASSWORD HASH
 *     a. In the Apps Script editor, open setAdminPassword().
 *     b. Replace 'REPLACE_WITH_YOUR_PASSWORD' with your desired password.
 *     c. Click Run. Copy the hash from the Execution Log.
 *     d. Paste the hash into ADMIN_PASSWORD_HASH below.
 *     e. Delete the plain-text password from setAdminPassword() immediately.
 *
 *  4. INITIALISE SHEETS
 *     • Run initializeSheets() once from the Apps Script editor.
 *       This creates all required tabs with headers in your spreadsheet.
 *       Safe to run again — it will not overwrite existing data.
 *
 *  5. STRIPE (optional but required for live payments)
 *     • Go to: Apps Script editor → Project Settings (⚙) → Script Properties.
 *     • Add a property: Name = STRIPE_SECRET_KEY, Value = sk_live_XXXX (or sk_test_XXXX).
 *     • Never hard-code your Stripe key in this file.
 *     • If the property is absent, the Stripe checkout will return an error to the client.
 *
 *  6. DEPLOY AS WEB APP
 *     • Apps Script editor → Deploy → New Deployment.
 *     • Type: Web App.
 *     • Execute as: Me.
 *     • Who has access: Anyone.
 *     • Click Deploy and copy the Web App URL.
 *
 *  7. CONNECT TO FRONTEND
 *     • Open script.js and paste the Web App URL into:
 *       CONFIG.APPS_SCRIPT_URL = 'https://script.google.com/macros/s/YOUR_ID/exec';
 *
 *  ── RE-DEPLOYMENT ─────────────────────────────────────────────
 *     Every time you edit Code.gs you MUST create a new deployment
 *     (Deploy → Manage Deployments → Edit → New Version → Deploy).
 *     The URL stays the same for the same deployment type.
 *
 *  ── MONTHLY AUTO-INVOICES ─────────────────────────────────────
 *     To automatically bill Growth Plan clients each month:
 *     • Apps Script editor → Triggers (clock icon) → Add Trigger.
 *     • Function: generateMonthlyInvoices
 *     • Event source: Time-driven → Month timer → Day 1 of month.
 *     Referral credits are automatically deducted before billing.
 *
 *  ── CREDIT SYSTEM ─────────────────────────────────────────────
 *     • Each converted referral adds $25 to the client's referralCredit balance.
 *     • When an invoice is created, available credit is deducted first.
 *     • Net amount (after credit) is what Stripe charges.
 *     • If credit fully covers the invoice it is marked paid automatically.
 *     • Admins can manually adjust credit via the Credits tab in the client modal.
 *
 *  ── STRIPE CHECKOUT FLOW ──────────────────────────────────────
 *     Admin creates invoice (credit auto-applied) → client clicks Pay Now
 *     → createStripeSession called → client redirected to Stripe-hosted page
 *     → Stripe redirects to /client-portal.html?payment_success=INV-001&stripe_session=cs_xxx
 *     → verifyStripePayment called → Stripe session verified → invoice marked paid
 *     → confirmation emails sent to client and admin.
 *
 *  ── CORS NOTE ─────────────────────────────────────────────────
 *     All fetch() calls use Content-Type: text/plain to avoid the browser
 *     sending a preflight OPTIONS request, which Apps Script does not support.
 *
 * ════════════════════════════════════════════════════════════════
 */

// ── Config ────────────────────────────────────────────────────────
const SPREADSHEET_ID      = '1b26o-ZQr5zsCdKJPmr29lHTgTGjh4MvKjRpx189zX_M';
const ADMIN_EMAIL         = 'caelmoloney@gmail.com';
const ADMIN_PASSWORD_HASH = '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b';
const ADMIN_TOKEN         = '1';
const SITE_URL            = 'https://www.cwostrategygroup.com';
const FROM_NAME           = 'CWO Strategy Group';
const REPLY_TO            = 'caelmoloney@gmail.com';
const REFERRAL_REWARD_USD = 25; // dollars credited per converted referral

// ── Sheet Names ───────────────────────────────────────────────────
const SHEETS = {
  CLIENTS:       'Clients',
  MESSAGES:      'Messages',
  FILES:         'Files',
  INVOICES:      'Invoices',
  CONTRACTS:     'Contracts',
  REVIEWS:       'Reviews',
  REFERRALS:     'Referrals',
  MAILING:       'MailingList',
  CONSULTATIONS: 'Consultations',
  ACTIVITY:      'Activity',
};

// ════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ════════════════════════════════════════════════════════════════

function doPost(e) {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  try {
    if (!e || !e.postData || !e.postData.contents) {
      out.setContent(JSON.stringify({ success: false, message: 'Empty request body.' }));
      return out;
    }
    let body;
    try { body = JSON.parse(e.postData.contents); }
    catch { out.setContent(JSON.stringify({ success: false, message: 'Invalid JSON.' })); return out; }

    const action = body.action || '';
    let result;

    switch (action) {
      // Auth
      case 'clientLogin':          result = clientLogin(body);          break;
      case 'adminLogin':           result = adminLogin(body);           break;
      case 'changePassword':       result = changePassword(body);       break;

      // Clients
      case 'getClientData':        result = getClientData(body);        break;
      case 'getClients':           result = getClients(body);           break;
      case 'createClient':         result = createClient(body);         break;
      case 'updateClient':         result = updateClient(body);         break;
      case 'updateProjectStatus':  result = updateProjectStatus(body);  break;
      case 'getClientSettings':    result = getClientSettings(body);    break;
      case 'updateClientSettings': result = updateClientSettings(body); break;

      // Messages
      case 'getMessages':          result = getMessages(body);          break;
      case 'sendMessage':          result = sendMessage(body);          break;

      // Files
      case 'uploadFile':           result = uploadFile(body);           break;
      case 'getFiles':             result = getFiles(body);             break;

      // Invoices
      case 'createInvoice':        result = createInvoice(body);        break;
      case 'getInvoices':          result = getInvoices(body);          break;
      case 'getAllInvoices':        result = getAllInvoices(body);       break;
      case 'markInvoicePaid':      result = markInvoicePaid(body);      break;

      // Contracts
      case 'signContract':         result = signContract(body);         break;
      case 'getContract':          result = getContract(body);          break;
      case 'getAllContracts':       result = getAllContracts(body);      break;
      case 'updateContract':       result = updateContract(body);       break;

      // Reviews
      case 'submitReview':         result = submitReview(body);         break;
      case 'getAllReviews':         result = getAllReviews(body);        break;
      case 'approveReview':        result = approveReview(body);        break;
      case 'rejectReview':         result = rejectReview(body);         break;

      // Referrals
      case 'getReferrals':         result = getReferrals(body);         break;
      case 'getAllReferrals':       result = getAllReferrals(body);      break;
      case 'convertReferral':      result = convertReferral(body);      break;

      // Mailing
      case 'subscribe':            result = subscribe(body);            break;
      case 'getMailingList':       result = getMailingList(body);       break;
      case 'unsubscribe':          result = unsubscribeEmail(body);     break;

      // Consultation
      case 'consultation':         result = saveConsultation(body);     break;

      // Analytics
      case 'getAnalytics':         result = getAnalytics(body);         break;

      // Stripe
      case 'createStripeSession':  result = createStripeSession(body);  break;
      case 'verifyStripePayment':  result = verifyStripePayment(body);  break;

      // Credit management
      case 'adjustCredit':         result = adjustCredit(body);         break;

      // Client outstanding balance
      case 'getOutstandingBalance': result = getOutstandingBalance(body); break;

      // Consultations
      case 'getConsultations':     result = getConsultations(body);     break;

      // Admin email
      case 'sendAdminEmail':       result = sendAdminEmail(body);       break;

      default:
        result = { success: false, message: 'Unknown action: ' + action };
    }
    out.setContent(JSON.stringify(result));
  } catch (err) {
    out.setContent(JSON.stringify({ success: false, message: 'Server error: ' + err.toString() }));
  }
  return out;
}

function doGet() {
  const out = ContentService.createTextOutput();
  out.setMimeType(ContentService.MimeType.JSON);
  out.setContent(JSON.stringify({ success: true, message: 'CWO Strategy Group API running.', ts: new Date().toISOString() }));
  return out;
}

// ════════════════════════════════════════════════════════════════
//  SHEET HELPERS
// ════════════════════════════════════════════════════════════════

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function getSheetData(sheetName) {
  const sheet = getSheet(sheetName);
  if (!sheet) return [];
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]) : ''; });
    return obj;
  });
}

function appendRow(sheetName, rowData) {
  const sheet = getSheet(sheetName);
  if (!sheet) throw new Error('Sheet not found: ' + sheetName);
  sheet.appendRow(rowData);
}

function updateRowByField(sheetName, fieldName, fieldValue, updates) {
  const sheet = getSheet(sheetName);
  if (!sheet) return false;
  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIdx  = headers.indexOf(fieldName);
  if (colIdx === -1) return false;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colIdx]) === String(fieldValue)) {
      Object.keys(updates).forEach(key => {
        const idx = headers.indexOf(key);
        if (idx !== -1) sheet.getRange(i + 1, idx + 1).setValue(updates[key]);
      });
      return true;
    }
  }
  return false;
}

function deleteRowByField(sheetName, fieldName, fieldValue) {
  const sheet = getSheet(sheetName);
  if (!sheet) return false;
  const values  = sheet.getDataRange().getValues();
  const headers = values[0];
  const colIdx  = headers.indexOf(fieldName);
  if (colIdx === -1) return false;
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][colIdx]) === String(fieldValue)) { sheet.deleteRow(i + 1); return true; }
  }
  return false;
}

function generateId(prefix) {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
}

function hashPassword(pw) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(pw));
  return bytes.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
}

/** Run once to generate admin password hash. Log output → paste as ADMIN_PASSWORD_HASH. */
function setAdminPassword() {
  const yourPassword = 'REPLACE_WITH_YOUR_PASSWORD';
  Logger.log('Hash: ' + hashPassword(yourPassword));
}

function logActivity(type, text) {
  try {
    appendRow(SHEETS.ACTIVITY, [generateId('ACT'), type, text,
      new Date().toLocaleTimeString(), new Date().toLocaleDateString()]);
  } catch (e) { Logger.log('logActivity: ' + e); }
}

// ════════════════════════════════════════════════════════════════
//  BRANDED HTML EMAIL SYSTEM
// ════════════════════════════════════════════════════════════════

function buildHtmlEmail({ to, subject, greeting, bodyHtml, ctaLabel, ctaUrl, footNote }) {
  const safeGreeting = greeting || '';
  const ctaBlock = (ctaLabel && ctaUrl) ? `
    <tr><td align="center" style="padding:28px 0 8px">
      <a href="${ctaUrl}" style="background:#C9A84C;color:#070B17;text-decoration:none;
        font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;
        padding:14px 36px;border-radius:4px;display:inline-block;font-family:Arial,sans-serif">
        ${ctaLabel}
      </a>
    </td></tr>` : '';

  const noteBlock = footNote ? `
    <tr><td style="padding:16px 0 0;font-family:Arial,sans-serif;font-size:12px;
      color:#8A9BBF;line-height:1.6;text-align:center">${footNote}</td></tr>` : '';

  const greetingBlock = safeGreeting ? `
    <p style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;
      font-size:20px;font-weight:600;color:#0D1526;line-height:1.3">${safeGreeting}</p>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#F2F4F8;font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F2F4F8">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0"
      style="max-width:600px;width:100%;background:#ffffff;border-radius:8px;
        overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10)">
      <!-- Header -->
      <tr><td style="background:#070B17;padding:32px 40px;text-align:center">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;
          font-weight:700;color:#FFFFFF;letter-spacing:0.5px">CWO Strategy Group</p>
        <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:10px;
          font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#C9A84C">
          Digital Growth Agency</p>
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px auto 0">
          <tr><td style="background:#C9A84C;height:2px;width:60px;border-radius:2px"></td></tr>
        </table>
      </td></tr>
      <!-- Body -->
      <tr><td style="padding:40px 40px 32px;background:#ffffff">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td>
            ${greetingBlock}
            <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;
              color:#374151;line-height:1.75">${bodyHtml}</div>
          </td></tr>
          ${ctaBlock}
          ${noteBlock}
        </table>
      </td></tr>
      <!-- Divider -->
      <tr><td style="padding:0 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="background:#E5E7EB;height:1px"></td></tr>
        </table>
      </td></tr>
      <!-- Footer -->
      <tr><td style="background:#0D1526;padding:28px 40px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="font-family:Arial,sans-serif;font-size:12px;color:#8A9BBF;line-height:1.7">
              <strong style="color:#C9A84C;font-size:13px">CWO Strategy Group</strong><br>
              <a href="mailto:${REPLY_TO}" style="color:#8A9BBF;text-decoration:none">${REPLY_TO}</a>
              &nbsp;&middot;&nbsp;
              <a href="${SITE_URL}" style="color:#8A9BBF;text-decoration:none">${SITE_URL.replace('https://','')}</a>
            </td>
            <td align="right">
              <a href="${SITE_URL}/client-portal.html"
                style="color:#C9A84C;text-decoration:none;font-family:Arial,sans-serif;font-size:11px">
                Client Portal
              </a>
            </td>
          </tr>
          <tr><td colspan="2" style="padding-top:14px;font-family:Arial,sans-serif;font-size:11px;
            color:#4D5D7A;line-height:1.6">
            You are receiving this email because you are a client or contact of CWO Strategy Group.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

  try {
    MailApp.sendEmail({ to, subject, htmlBody: html, name: FROM_NAME, replyTo: REPLY_TO });
  } catch (err) {
    Logger.log('buildHtmlEmail error [' + to + ']: ' + err.toString());
  }
}

// ════════════════════════════════════════════════════════════════
//  INITIALIZE SHEETS  (run once from Apps Script editor)
// ════════════════════════════════════════════════════════════════

function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const schema = {
    // disabledSections: JSON array of section IDs to hide in client portal
    // referralCredit:   accumulated dollar credit (auto-deducted from invoices)
    [SHEETS.CLIENTS]: [
      'id','name','email','passwordHash','business','phone',
      'plan','status','stage','referralCode','referredBy',
      'notes','createdAt','lastUpdated','disabledSections','referralCredit',
    ],
    [SHEETS.MESSAGES]: ['id','clientId','from','name','text','time','date','read'],
    [SHEETS.FILES]: ['id','clientId','name','ext','mimeType','size','url','driveId','date','uploadedBy'],
    [SHEETS.INVOICES]: [
      'number','clientId','clientName','description','amount',
      'status','dueDate','stripeLink','paidDate','createdAt','creditApplied','stripeSessionId',
    ],
    [SHEETS.CONTRACTS]: [
      'id','clientId','clientName','business',
      'signerName','status','signedDate','signatureData','driveFileId',
    ],
    [SHEETS.REVIEWS]:      ['id','clientId','clientName','rating','title','body','date','status'],
    [SHEETS.REFERRALS]:    ['id','referrerId','referrerName','referralCode','business','email','date','status','rewardIssued'],
    [SHEETS.MAILING]:      ['email','date','source'],
    [SHEETS.CONSULTATIONS]:['id','name','email','phone','business','website','service','budget','message','referralSource','referralCode','submittedAt'],
    [SHEETS.ACTIVITY]:     ['id','type','text','time','date'],
  };

  Object.entries(schema).forEach(([name, headers]) => {
    let sheet = ss.getSheetByName(name);
    if (!sheet) sheet = ss.insertSheet(name);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold').setBackground('#1a2540').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  });
  Logger.log('All sheets initialised.');
}

// ════════════════════════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════════════════════════

function clientLogin({ email, password }) {
  if (!email || !password) return { success: false, message: 'Email and password are required.' };
  const client = getSheetData(SHEETS.CLIENTS)
    .find(c => c.email.toLowerCase() === email.trim().toLowerCase());
  if (!client) return { success: false, message: 'No account found with that email address.' };
  if (client.passwordHash !== hashPassword(password)) return { success: false, message: 'Incorrect password.' };
  if (client.status === 'inactive') return { success: false, message: 'This account is inactive. Please contact us.' };
  return {
    success: true,
    user: {
      id: client.id, name: client.name, email: client.email,
      business: client.business, plan: client.plan, status: client.status,
      referralCode: client.referralCode,
    },
  };
}

function adminLogin({ email, password }) {
  if (!email || !password) return { success: false, message: 'Email and password required.' };
  if (ADMIN_PASSWORD_HASH === 'PASTE_HASH_FROM_setAdminPassword_HERE' || !ADMIN_PASSWORD_HASH) {
    return { success: false, message: 'Admin password not configured. Run setAdminPassword() first.' };
  }
  if (email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase() && hashPassword(password) === ADMIN_PASSWORD_HASH) {
    return { success: true, token: ADMIN_TOKEN, user: { name: 'Admin', email: ADMIN_EMAIL } };
  }
  return { success: false, message: 'Invalid credentials.' };
}

function changePassword({ clientId, currentPassword, newPassword }) {
  if (!clientId || !currentPassword || !newPassword) {
    return { success: false, message: 'clientId, currentPassword, and newPassword required.' };
  }
  if (newPassword.length < 8) return { success: false, message: 'New password must be at least 8 characters.' };
  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };
  if (client.passwordHash !== hashPassword(currentPassword)) return { success: false, message: 'Current password is incorrect.' };
  const updated = updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
    passwordHash: hashPassword(newPassword), lastUpdated: new Date().toLocaleDateString(),
  });
  if (!updated) return { success: false, message: 'Update failed.' };
  buildHtmlEmail({
    to: client.email, subject: 'Password Updated — CWO Strategy Group',
    greeting: 'Hi ' + client.name + ',',
    bodyHtml: `<p>Your portal password was successfully updated.</p>
               <p>If you did not make this change, contact us immediately at
               <a href="mailto:${REPLY_TO}" style="color:#C9A84C">${REPLY_TO}</a>.</p>`,
    ctaLabel: 'Go to Client Portal', ctaUrl: SITE_URL + '/client-portal.html',
  });
  logActivity('auth', 'Password changed for ' + client.name);
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
//  CLIENT MANAGEMENT
// ════════════════════════════════════════════════════════════════

function getClients({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  const clients = getSheetData(SHEETS.CLIENTS).map(c => ({
    id: c.id, name: c.name, email: c.email, business: c.business,
    phone: c.phone, plan: c.plan, status: c.status, stage: c.stage,
    referralCode: c.referralCode, notes: c.notes,
    since: c.createdAt, lastUpdated: c.lastUpdated,
    referralCredit: parseFloat(c.referralCredit) || 0,
  }));
  return { success: true, clients };
}

function getClientData({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };
  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };
  return {
    success: true,
    client: {
      status: client.status, stage: client.stage, plan: client.plan,
      startDate: client.createdAt, referralCredit: parseFloat(client.referralCredit) || 0,
    },
  };
}

function createClient({ adminToken, name, email, business, phone, plan, status, password, notes }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!name || !email || !plan || !password) {
    return { success: false, message: 'name, email, plan, and password are required.' };
  }
  const existing = getSheetData(SHEETS.CLIENTS)
    .find(c => c.email.toLowerCase() === email.trim().toLowerCase());
  if (existing) return { success: false, message: 'A client with that email already exists.' };
  const id   = generateId('CLT');
  const code = 'CWREF-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  const date = new Date().toLocaleDateString();
  appendRow(SHEETS.CLIENTS, [
    id, name.trim(), email.trim().toLowerCase(), hashPassword(password),
    (business || '').trim(), (phone || '').trim(),
    plan, status || 'active', 'consultation',
    code, '', (notes || '').trim(), date, date,
    '[]',   // disabledSections — empty JSON array
    '0',    // referralCredit
  ]);
  buildHtmlEmail({
    to: email.trim(), subject: 'Welcome to CWO Strategy Group — Your Portal Access',
    greeting: 'Hi ' + name.trim() + ',',
    bodyHtml: `<p>Your CWO Strategy Group client portal account is ready. Log in to track your project, 
               send messages, view invoices, and access your files all in one place.</p>
               <table role="presentation" cellpadding="0" cellspacing="0"
                 style="background:#F2F4F8;border-radius:6px;width:100%;margin:16px 0">
                 <tr><td style="padding:20px 24px">
                   <p style="margin:0 0 6px;font-size:13px;color:#6B7280;text-transform:uppercase;
                     letter-spacing:1px;font-family:Arial,sans-serif">Login Credentials</p>
                   <p style="margin:0;font-size:15px;color:#0D1526;font-family:Arial,sans-serif">
                     <strong>Email:</strong> ${email.trim()}<br>
                     <strong>Temporary Password:</strong> ${password}</p>
                 </td></tr>
               </table>
               <p style="color:#6B7280;font-size:13px">Please log in and change your password 
               in Account Settings as soon as possible.</p>`,
    ctaLabel: 'Log In to Your Portal', ctaUrl: SITE_URL + '/client-portal.html',
    footNote: 'Keep your credentials safe. Contact us if you did not request this account.',
  });
  logActivity('client', 'Client created: ' + name + ' (' + (business || email) + ')');
  return { success: true, id, referralCode: code };
}

/**
 * updateClient — admin edits any client field.
 * Supports: name, email, business, phone, plan, status, notes, password (reset).
 * Does NOT overwrite passwordHash unless newPassword is explicitly provided.
 */
function updateClient({ adminToken, clientId, name, email, business, phone, plan, status, notes, newPassword }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!clientId) return { success: false, message: 'clientId required.' };

  const clients = getSheetData(SHEETS.CLIENTS);
  const client  = clients.find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };

  // Check for email uniqueness if changing email
  if (email && email.trim().toLowerCase() !== client.email.toLowerCase()) {
    const dupe = clients.find(c => c.id !== clientId && c.email.toLowerCase() === email.trim().toLowerCase());
    if (dupe) return { success: false, message: 'Another client already uses that email address.' };
  }

  const updates = { lastUpdated: new Date().toLocaleDateString() };
  if (name)     updates.name     = name.trim();
  if (email)    updates.email    = email.trim().toLowerCase();
  if (business !== undefined) updates.business = business.trim();
  if (phone     !== undefined) updates.phone    = phone.trim();
  if (plan)     updates.plan     = plan;
  if (status)   updates.status   = status;
  if (notes     !== undefined) updates.notes    = notes.trim();
  if (newPassword && newPassword.length >= 8) updates.passwordHash = hashPassword(newPassword);

  const updated = updateRowByField(SHEETS.CLIENTS, 'id', clientId, updates);
  if (!updated) return { success: false, message: 'Update failed.' };

  // Notify client if password was reset by admin
  if (newPassword && newPassword.length >= 8) {
    buildHtmlEmail({
      to: (email || client.email), subject: 'Your Password Has Been Reset — CWO Strategy Group',
      greeting: 'Hi ' + (name || client.name) + ',',
      bodyHtml: `<p>Your portal password has been reset by our team.</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F2F4F8;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px;font-family:Arial,sans-serif;font-size:15px;color:#0D1526">
                     <strong>New Temporary Password:</strong> ${newPassword}
                   </td></tr>
                 </table>
                 <p style="color:#6B7280;font-size:13px">Please log in and change your password immediately 
                 in Account Settings.</p>`,
      ctaLabel: 'Log In to Portal', ctaUrl: SITE_URL + '/client-portal.html',
    });
  }

  logActivity('client', 'Client updated: ' + (name || client.name) + ' (' + clientId + ')');
  return { success: true };
}

function updateProjectStatus({ adminToken, clientId, stage, note }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!clientId || !stage) return { success: false, message: 'clientId and stage required.' };
  const updated = updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
    stage, lastUpdated: new Date().toLocaleDateString(),
  });
  if (!updated) return { success: false, message: 'Client not found.' };
  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (client && note) {
    buildHtmlEmail({
      to: client.email, subject: 'Project Update — ' + stage + ' Stage',
      greeting: 'Hi ' + client.name + ',',
      bodyHtml: `<p>Your project has moved to the <strong>${stage}</strong> stage.</p><p>${note}</p>`,
      ctaLabel: 'View Project Status', ctaUrl: SITE_URL + '/client-portal.html',
    });
  }
  logActivity('project', 'Status → ' + stage + ' for ' + (client ? client.name : clientId));
  return { success: true };
}

// ── Client Portal Page Settings ───────────────────────────────────
// Stores an array of section IDs that are hidden in the client portal.
// e.g. ['referrals','reviews'] disables those tabs for that client.

function getClientSettings({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };
  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };
  let disabled = [];
  try { disabled = JSON.parse(client.disabledSections || '[]'); } catch { disabled = []; }
  return { success: true, disabledSections: disabled };
}

function updateClientSettings({ adminToken, clientId, disabledSections }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!clientId) return { success: false, message: 'clientId required.' };
  const value = JSON.stringify(Array.isArray(disabledSections) ? disabledSections : []);
  const updated = updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
    disabledSections: value, lastUpdated: new Date().toLocaleDateString(),
  });
  return updated ? { success: true } : { success: false, message: 'Client not found.' };
}

// ════════════════════════════════════════════════════════════════
//  MESSAGES
// ════════════════════════════════════════════════════════════════

function getMessages({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };
  const messages = getSheetData(SHEETS.MESSAGES)
    .filter(m => m.clientId === clientId)
    .map(m => ({ id: m.id, from: m.from, name: m.name, text: m.text, time: m.time, date: m.date }));
  return { success: true, messages };
}

function sendMessage({ clientId, message, role }) {
  if (!clientId || !message || !message.text) {
    return { success: false, message: 'clientId and message.text required.' };
  }
  const id = generateId('MSG');
  appendRow(SHEETS.MESSAGES, [
    id, clientId, message.from || (role === 'admin' ? 'admin' : 'client'),
    message.name || '', message.text,
    message.time || new Date().toLocaleTimeString(),
    new Date().toLocaleDateString(), 'false',
  ]);
  // Email admin on new client message
  if (!role || role === 'client') {
    const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
    buildHtmlEmail({
      to: ADMIN_EMAIL, subject: 'New Client Message — ' + (message.name || clientId),
      greeting: 'New message received,',
      bodyHtml: `<p><strong>From:</strong> ${message.name || 'Client'}</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F2F4F8;border-radius:6px;width:100%;margin:12px 0">
                   <tr><td style="padding:16px 20px;font-family:Arial,sans-serif;
                     font-size:15px;color:#374151;font-style:italic">"${message.text}"</td></tr>
                 </table>
                 <p style="color:#6B7280;font-size:13px">
                   Client: ${client ? client.name + ' — ' + (client.business || client.email) : clientId}</p>`,
      ctaLabel: 'Reply in Admin Portal', ctaUrl: SITE_URL + '/admin-portal.html',
    });
  }
  return { success: true, id };
}

// ════════════════════════════════════════════════════════════════
//  FILES
// ════════════════════════════════════════════════════════════════

function uploadFile({ clientId, fileName, fileData, mimeType, size, uploadedBy }) {
  if (!clientId || !fileName || !fileData) {
    return { success: false, message: 'clientId, fileName, and fileData required.' };
  }
  try {
    const folder = getOrCreateClientFolder(clientId);
    const blob   = Utilities.newBlob(Utilities.base64Decode(fileData), mimeType || 'application/octet-stream', fileName);
    const file   = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const id  = generateId('FILE');
    const ext = fileName.split('.').pop().toUpperCase();
    appendRow(SHEETS.FILES, [
      id, clientId, fileName, ext, mimeType || '', size || '',
      file.getDownloadUrl(), file.getId(),
      new Date().toLocaleDateString(), uploadedBy || 'client',
    ]);
    logActivity('file', 'File uploaded: ' + fileName + ' for ' + clientId);
    return { success: true, id, url: file.getDownloadUrl() };
  } catch (err) {
    return { success: false, message: 'Upload failed: ' + err.toString() };
  }
}

function getOrCreateClientFolder(clientId) {
  const rootName = 'CWO-ClientFiles';
  const roots    = DriveApp.getFoldersByName(rootName);
  const root     = roots.hasNext() ? roots.next() : DriveApp.createFolder(rootName);
  const subs     = root.getFoldersByName(clientId);
  return subs.hasNext() ? subs.next() : root.createFolder(clientId);
}

function getFiles({ clientId, adminToken }) {
  const all   = getSheetData(SHEETS.FILES);
  const files = (adminToken === ADMIN_TOKEN ? all : all.filter(f => f.clientId === clientId))
    .map(f => ({ id: f.id, clientId: f.clientId, name: f.name, ext: f.ext,
      size: f.size, url: f.url, date: f.date, uploadedBy: f.uploadedBy }));
  return { success: true, files };
}

// ════════════════════════════════════════════════════════════════
//  INVOICES
//  Auto-applies available referral credit to new invoices.
// ════════════════════════════════════════════════════════════════

function createInvoice({ adminToken, clientId, amount, description, dueDate, stripeLink }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!clientId || !amount || !description || !dueDate) {
    return { success: false, message: 'clientId, amount, description, and dueDate required.' };
  }

  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };

  let rawAmount      = parseFloat(amount);
  let creditApplied  = 0;
  let availableCredit = parseFloat(client.referralCredit) || 0;

  // Auto-apply referral credit if client has any
  if (availableCredit > 0) {
    creditApplied  = Math.min(availableCredit, rawAmount);
    rawAmount      = Math.max(0, rawAmount - creditApplied);
    // Zero out (or reduce) the referral credit on the client record
    const remaining = Math.max(0, availableCredit - creditApplied);
    updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
      referralCredit: remaining.toFixed(2), lastUpdated: new Date().toLocaleDateString(),
    });
  }

  const invoices = getSheetData(SHEETS.INVOICES);
  const number   = 'INV-' + String(invoices.length + 1).padStart(3, '0');

  appendRow(SHEETS.INVOICES, [
    number, clientId, client.name,
    description, rawAmount.toFixed(2),
    rawAmount === 0 ? 'paid' : 'due',
    dueDate, stripeLink || '', '', new Date().toLocaleDateString(),
    creditApplied.toFixed(2),
  ]);

  // Build email
  const creditNote = creditApplied > 0
    ? `<tr style="background:#F0FDF4"><td style="padding:10px 14px;font-family:Arial,sans-serif;
         font-size:13px;color:#16A34A;text-transform:uppercase;letter-spacing:.8px;width:120px">
         Credit Applied</td>
       <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:14px;
         color:#16A34A;text-align:right;font-weight:700">
         -$${creditApplied.toFixed(2)} (referral reward)</td></tr>` : '';

  buildHtmlEmail({
    to: client.email, subject: 'Invoice ' + number + ' — CWO Strategy Group',
    greeting: 'Hi ' + client.name + ',',
    bodyHtml: `<p>A new invoice has been issued for your account.</p>
               <table role="presentation" cellpadding="0" cellspacing="0"
                 style="width:100%;border-collapse:collapse;margin:16px 0">
                 <tr style="background:#F2F4F8">
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;
                     color:#6B7280;text-transform:uppercase;letter-spacing:.8px;width:120px">Invoice</td>
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:14px;
                     color:#0D1526;text-align:right">${number}</td>
                 </tr>
                 <tr>
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;
                     color:#6B7280;text-transform:uppercase;letter-spacing:.8px;
                     border-top:1px solid #E5E7EB">Description</td>
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:14px;
                     color:#374151;text-align:right;border-top:1px solid #E5E7EB">${description}</td>
                 </tr>
                 ${creditNote}
                 <tr style="background:#F2F4F8">
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;
                     color:#6B7280;text-transform:uppercase;letter-spacing:.8px">Amount Due</td>
                   <td style="padding:10px 14px;font-family:Georgia,serif;font-size:22px;
                     font-weight:700;color:#C9A84C;text-align:right">
                     ${rawAmount === 0 ? '<span style="color:#16A34A">$0.00 — Covered by credit</span>' : '$' + rawAmount.toFixed(2)}
                   </td>
                 </tr>
                 <tr>
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:13px;
                     color:#6B7280;text-transform:uppercase;letter-spacing:.8px;
                     border-top:1px solid #E5E7EB">Due Date</td>
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:14px;
                     color:#374151;text-align:right;border-top:1px solid #E5E7EB">${dueDate}</td>
                 </tr>
               </table>
               ${creditApplied > 0 ? '<p style="color:#16A34A;font-size:13px"><strong>Note:</strong> Your $' + creditApplied.toFixed(2) + ' referral reward credit was automatically applied to this invoice.</p>' : ''}`,
    ctaLabel: rawAmount === 0 ? 'View Your Portal' : (stripeLink ? 'Pay Now — $' + rawAmount.toFixed(2) : 'View Invoice'),
    ctaUrl:   rawAmount === 0 ? SITE_URL + '/client-portal.html' : (stripeLink || SITE_URL + '/client-portal.html'),
  });

  logActivity('invoice', 'Invoice ' + number + ' created: $' + rawAmount.toFixed(2) +
    (creditApplied > 0 ? ' (credit -$' + creditApplied.toFixed(2) + ')' : '') +
    ' for ' + client.name);

  return { success: true, number, creditApplied: creditApplied.toFixed(2), finalAmount: rawAmount.toFixed(2) };
}

function getInvoices({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };
  const invoices = getSheetData(SHEETS.INVOICES)
    .filter(i => i.clientId === clientId)
    .map(i => ({ number: i.number, description: i.description, amount: i.amount,
      status: i.status, dueDate: i.dueDate, stripeLink: i.stripeLink,
      paidDate: i.paidDate, creditApplied: i.creditApplied || '0',
      createdAt: i.createdAt || '' }));
  return { success: true, invoices };
}

function getAllInvoices({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  const invoices = getSheetData(SHEETS.INVOICES).map(i => ({
    number: i.number, clientId: i.clientId, clientName: i.clientName,
    description: i.description, amount: i.amount, status: i.status,
    dueDate: i.dueDate, creditApplied: i.creditApplied || '0',
    paidDate: i.paidDate || '', createdAt: i.createdAt || '',
  }));
  return { success: true, invoices };
}

function markInvoicePaid({ adminToken, invoiceNumber }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  const updated = updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
    status: 'paid', paidDate: new Date().toLocaleDateString(),
  });
  if (!updated) return { success: false, message: 'Invoice not found.' };
  logActivity('invoice', 'Invoice ' + invoiceNumber + ' marked paid');
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
//  CONTRACTS
// ════════════════════════════════════════════════════════════════

function signContract({ clientId, signerName, signatureData, timestamp }) {
  if (!clientId || !signerName) return { success: false, message: 'clientId and signerName required.' };
  const client     = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  const signedDate = timestamp || new Date().toLocaleString();
  let driveFileId  = '';

  if (signatureData && signatureData.startsWith('data:image/')) {
    try {
      const folder  = getOrCreateClientFolder(clientId);
      const base64  = signatureData.split(',')[1];
      const blob    = Utilities.newBlob(
        Utilities.base64Decode(base64), 'image/png',
        'signature_' + clientId + '_' + Date.now() + '.png'
      );
      const sigFile = folder.createFile(blob);
      sigFile.setDescription('Contract signature — ' + (client ? client.name : clientId) + ' — ' + signedDate);
      driveFileId   = sigFile.getId();
    } catch (err) { Logger.log('Signature Drive error: ' + err); }
  }

  const existing = getSheetData(SHEETS.CONTRACTS).find(c => c.clientId === clientId);
  if (existing) {
    updateRowByField(SHEETS.CONTRACTS, 'clientId', clientId, {
      signerName, status: 'signed', signedDate,
      signatureData: signatureData || '', driveFileId,
    });
  } else {
    appendRow(SHEETS.CONTRACTS, [
      generateId('CTR'), clientId, client ? client.name : '', client ? (client.business || '') : '',
      signerName, 'signed', signedDate, signatureData || '', driveFileId,
    ]);
  }

  if (client) {
    buildHtmlEmail({
      to: client.email, subject: 'Service Agreement Signed — CWO Strategy Group',
      greeting: 'Hi ' + signerName + ',',
      bodyHtml: `<p>Thank you for signing the CWO Strategy Group Service Agreement. 
                 Your digital signature has been securely recorded.</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F2F4F8;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px">
                     <p style="margin:0;font-family:Arial,sans-serif;font-size:14px;color:#374151">
                       <strong style="color:#0D1526">Signed by:</strong> ${signerName}<br>
                       <strong style="color:#0D1526">Date &amp; Time:</strong> ${signedDate}<br>
                       <strong style="color:#0D1526">Status:</strong>
                       <span style="color:#16A34A;font-weight:700">Executed</span></p>
                   </td></tr>
                 </table>`,
      ctaLabel: 'View Your Portal', ctaUrl: SITE_URL + '/client-portal.html',
      footNote: 'If you have questions about this agreement, contact us at ' + REPLY_TO,
    });
    buildHtmlEmail({
      to: ADMIN_EMAIL, subject: 'Contract Signed — ' + client.name,
      greeting: 'Contract signed,',
      bodyHtml: `<p><strong>${signerName}</strong> (${client.name} — ${client.business || client.email})
                 signed the Service Agreement on <strong>${signedDate}</strong>.</p>`,
      ctaLabel: 'View in Admin Portal', ctaUrl: SITE_URL + '/admin-portal.html',
    });
  }
  logActivity('contract', 'Contract signed by ' + signerName + ' (' + clientId + ')');
  return { success: true, signedDate };
}

function getContract({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };
  const contract = getSheetData(SHEETS.CONTRACTS).find(c => c.clientId === clientId);
  if (!contract) return { success: true, status: 'pending', signedDate: null, signerName: null };
  return { success: true, status: contract.status, signedDate: contract.signedDate, signerName: contract.signerName };
}

function getAllContracts({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  const contracts = getSheetData(SHEETS.CONTRACTS);
  const clients   = getSheetData(SHEETS.CLIENTS);
  const signedIds = new Set(contracts.map(c => c.clientId));
  const result    = contracts.map(c => ({
    clientId: c.clientId, clientName: c.clientName, business: c.business,
    signerName: c.signerName, status: c.status, signedDate: c.signedDate,
    signatureData: c.signatureData || '', driveFileId: c.driveFileId || '',
  }));
  clients.filter(c => !signedIds.has(c.id)).forEach(c => {
    result.push({ clientId: c.id, clientName: c.name, business: c.business || '—',
      signerName: '—', status: 'pending', signedDate: '—', signatureData: '', driveFileId: '' });
  });
  return { success: true, contracts: result };
}

/**
 * updateContract — admin can override signer details or re-request a signature.
 * action: 'update' → update signerName/signedDate fields
 * action: 'void'   → mark contract as pending (requires re-sign from client)
 */
function updateContract({ adminToken, clientId, signerName, signedDate, contractAction }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!clientId) return { success: false, message: 'clientId required.' };

  const existing = getSheetData(SHEETS.CONTRACTS).find(c => c.clientId === clientId);

  if (contractAction === 'void') {
    // Mark as pending — client must re-sign
    if (existing) {
      updateRowByField(SHEETS.CONTRACTS, 'clientId', clientId, {
        status: 'pending', signerName: '', signedDate: '', signatureData: '', driveFileId: '',
      });
    }
    const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
    if (client) {
      buildHtmlEmail({
        to: client.email, subject: 'Please Re-Sign Your Service Agreement — CWO Strategy Group',
        greeting: 'Hi ' + client.name + ',',
        bodyHtml: `<p>Your previously signed Service Agreement has been reset by our team 
                   and requires a new signature. This may be due to an updated agreement or 
                   an administrative correction.</p>
                   <p>Please log in to your client portal and navigate to the <strong>Contract</strong>
                   section to review and sign the updated agreement.</p>`,
        ctaLabel: 'Sign Agreement', ctaUrl: SITE_URL + '/client-portal.html',
      });
    }
    logActivity('contract', 'Contract voided/reset for ' + clientId);
    return { success: true };
  }

  // Default: update signer details
  const updates = {};
  if (signerName)  updates.signerName  = signerName;
  if (signedDate)  updates.signedDate  = signedDate;

  if (existing) {
    updateRowByField(SHEETS.CONTRACTS, 'clientId', clientId, updates);
  } else {
    const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
    appendRow(SHEETS.CONTRACTS, [
      generateId('CTR'), clientId, client ? client.name : '', client ? (client.business || '') : '',
      signerName || '', 'signed', signedDate || new Date().toLocaleDateString(), '', '',
    ]);
  }
  logActivity('contract', 'Contract details updated for ' + clientId);
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
//  REVIEWS
// ════════════════════════════════════════════════════════════════

function submitReview({ clientId, clientName, rating, title, body, date }) {
  if (!clientId || !rating || !title || !body) {
    return { success: false, message: 'clientId, rating, title, and body required.' };
  }
  const id = generateId('REV');
  appendRow(SHEETS.REVIEWS, [
    id, clientId, clientName || '', parseInt(rating), title, body,
    date || new Date().toLocaleDateString(), 'pending',
  ]);
  buildHtmlEmail({
    to: ADMIN_EMAIL, subject: 'New ' + rating + '-Star Review Awaiting Approval',
    greeting: 'New review submitted,',
    bodyHtml: `<p><strong>From:</strong> ${clientName}</p>
               <p><strong>Rating:</strong> ${'★'.repeat(parseInt(rating))} (${rating}/5)</p>
               <p><strong>Title:</strong> ${title}</p>
               <table role="presentation" cellpadding="0" cellspacing="0"
                 style="background:#F2F4F8;border-radius:6px;width:100%;margin:12px 0">
                 <tr><td style="padding:16px 20px;font-family:Arial,sans-serif;font-size:15px;
                   color:#374151;font-style:italic">"${body}"</td></tr>
               </table>`,
    ctaLabel: 'Moderate in Admin Portal', ctaUrl: SITE_URL + '/admin-portal.html',
  });
  logActivity('review', 'New ' + rating + '-star review from ' + clientName);
  return { success: true, id };
}

function getAllReviews({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  return { success: true, reviews: getSheetData(SHEETS.REVIEWS).map(r => ({
    id: r.id, clientName: r.clientName, rating: parseInt(r.rating) || 5,
    title: r.title, body: r.body, date: r.date, status: r.status,
  }))};
}

function approveReview({ adminToken, reviewId }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  return updateRowByField(SHEETS.REVIEWS, 'id', reviewId, { status: 'approved' })
    ? { success: true } : { success: false, message: 'Review not found.' };
}

function rejectReview({ adminToken, reviewId }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  return deleteRowByField(SHEETS.REVIEWS, 'id', reviewId)
    ? { success: true } : { success: false, message: 'Review not found.' };
}

// ════════════════════════════════════════════════════════════════
//  REFERRALS
//  When a referral is converted, $25 credit is added to the
//  referrer's referralCredit balance and applied on their next invoice.
// ════════════════════════════════════════════════════════════════

function getReferrals({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };
  const referrals = getSheetData(SHEETS.REFERRALS)
    .filter(r => r.referrerId === clientId)
    .map(r => ({ id: r.id, business: r.business, date: r.date, status: r.status, rewardIssued: r.rewardIssued }));
  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  return {
    success: true, referrals,
    availableCredit: client ? parseFloat(client.referralCredit) || 0 : 0,
  };
}

function getAllReferrals({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  return { success: true, referrals: getSheetData(SHEETS.REFERRALS).map(r => ({
    id: r.id, referrerName: r.referrerName, business: r.business,
    date: r.date, status: r.status, rewardIssued: r.rewardIssued,
  }))};
}

function convertReferral({ adminToken, referralId }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };

  const referrals = getSheetData(SHEETS.REFERRALS);
  const referral  = referrals.find(r => r.id === referralId);
  if (!referral) return { success: false, message: 'Referral not found.' };
  if (referral.status === 'converted') return { success: false, message: 'Already converted.' };

  // Mark referral converted
  const updated = updateRowByField(SHEETS.REFERRALS, 'id', referralId, {
    status: 'converted', rewardIssued: 'yes',
  });
  if (!updated) return { success: false, message: 'Update failed.' };

  // Add $25 credit to the referrer's account
  const referrer = getSheetData(SHEETS.CLIENTS).find(c => c.id === referral.referrerId);
  if (referrer) {
    const currentCredit = parseFloat(referrer.referralCredit) || 0;
    const newCredit     = currentCredit + REFERRAL_REWARD_USD;
    updateRowByField(SHEETS.CLIENTS, 'id', referral.referrerId, {
      referralCredit: newCredit.toFixed(2),
      lastUpdated:    new Date().toLocaleDateString(),
    });

    // Notify referrer of their credit
    buildHtmlEmail({
      to: referrer.email, subject: 'You earned a $' + REFERRAL_REWARD_USD + ' referral credit!',
      greeting: 'Hi ' + referrer.name + ',',
      bodyHtml: `<p>Great news — the business you referred has become a CWO Strategy Group client!</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F0FDF4;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px;text-align:center">
                     <p style="margin:0;font-family:Georgia,serif;font-size:32px;
                       font-weight:700;color:#16A34A">+$${REFERRAL_REWARD_USD}.00</p>
                     <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;
                       color:#374151">Referral credit added to your account</p>
                   </td></tr>
                 </table>
                 <p>Your <strong>$${newCredit.toFixed(2)} total credit</strong> will be 
                 automatically applied to your next invoice.</p>
                 <p style="color:#6B7280;font-size:13px">
                   Thank you for recommending CWO Strategy Group to other businesses.</p>`,
      ctaLabel: 'View Your Portal', ctaUrl: SITE_URL + '/client-portal.html',
    });
  }

  logActivity('referral', 'Referral converted — $' + REFERRAL_REWARD_USD + ' credited to ' +
    (referrer ? referrer.name : referral.referrerId));
  return { success: true, creditAdded: REFERRAL_REWARD_USD };
}

function trackReferral(referralCode, business, email) {
  if (!referralCode) return;
  const referrer = getSheetData(SHEETS.CLIENTS).find(c => c.referralCode === referralCode);
  if (!referrer) return;
  appendRow(SHEETS.REFERRALS, [
    generateId('REF'), referrer.id, referrer.name, referralCode,
    business || '', email || '', new Date().toLocaleDateString(), 'pending', 'no',
  ]);
}

// ════════════════════════════════════════════════════════════════
//  MAILING LIST
// ════════════════════════════════════════════════════════════════

function subscribe({ email }) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { success: false, message: 'Valid email address required.' };
  }
  const exists = getSheetData(SHEETS.MAILING)
    .find(s => s.email.toLowerCase() === email.trim().toLowerCase());
  if (exists) return { success: true, message: 'Already subscribed.' };
  appendRow(SHEETS.MAILING, [email.trim().toLowerCase(), new Date().toLocaleDateString(), 'Website']);
  buildHtmlEmail({
    to: email.trim(), subject: 'You are subscribed to CWO Strategy Group updates',
    greeting: 'Welcome,',
    bodyHtml: `<p>Thank you for subscribing to updates from CWO Strategy Group.</p>
               <p>We will keep you informed about web design insights, SEO strategies, 
               and exclusive offers for growing businesses.</p>
               <p style="color:#6B7280;font-size:13px">
                 To unsubscribe at any time, reply to this email with "Unsubscribe" in the subject.</p>`,
    ctaLabel: 'Visit Our Website', ctaUrl: SITE_URL,
  });
  return { success: true };
}

function getMailingList({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  return { success: true, subscribers: getSheetData(SHEETS.MAILING)
    .map(s => ({ email: s.email, date: s.date, source: s.source })) };
}

function unsubscribeEmail({ adminToken, email }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  return deleteRowByField(SHEETS.MAILING, 'email', email.toLowerCase())
    ? { success: true } : { success: false, message: 'Email not found.' };
}

// ════════════════════════════════════════════════════════════════
//  CONSULTATION
// ════════════════════════════════════════════════════════════════

function saveConsultation({ name, email, phone, business, website, service, budget, message, referral_source, referral_code }) {
  if (!name || !email || !business || !service || !message) {
    return { success: false, message: 'name, email, business, service, and message required.' };
  }
  const id = generateId('CON');
  appendRow(SHEETS.CONSULTATIONS, [
    id, name, email, phone || '', business, website || '',
    service, budget || '', message, referral_source || '', referral_code || '',
    new Date().toLocaleString(),
  ]);
  if (referral_code) trackReferral(referral_code, business, email);

  buildHtmlEmail({
    to: ADMIN_EMAIL, subject: 'New Consultation — ' + name + ' (' + business + ')',
    greeting: 'New consultation request,',
    bodyHtml: `<table role="presentation" cellpadding="0" cellspacing="0"
               style="width:100%;border-collapse:collapse;margin:8px 0 16px">
               ${[['Name',name],['Email',email],['Phone',phone||'N/A'],
                  ['Business',business],['Website',website||'N/A'],
                  ['Service',service],['Budget',budget||'N/A'],
                  ['Referral Code',referral_code||'None']].map((r,i)=>`
                 <tr style="${i%2===0?'background:#F2F4F8':''}">
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:12px;
                     color:#6B7280;text-transform:uppercase;letter-spacing:.8px;width:120px">${r[0]}</td>
                   <td style="padding:10px 14px;font-family:Arial,sans-serif;font-size:14px;
                     color:#0D1526;font-weight:600">${r[1]}</td>
                 </tr>`).join('')}
               </table>
               <p style="margin:0 0 4px;font-size:12px;color:#6B7280;
                 text-transform:uppercase;letter-spacing:.8px">Message</p>
               <table role="presentation" cellpadding="0" cellspacing="0"
                 style="background:#F2F4F8;border-radius:6px;width:100%">
                 <tr><td style="padding:16px 20px;font-family:Arial,sans-serif;
                   font-size:15px;color:#374151;line-height:1.7">${message}</td></tr>
               </table>`,
    ctaLabel: 'View in Admin Portal', ctaUrl: SITE_URL + '/admin-portal.html',
  });

  buildHtmlEmail({
    to: email, subject: 'We received your request — CWO Strategy Group',
    greeting: 'Hi ' + name + ',',
    bodyHtml: `<p>Thank you for reaching out to CWO Strategy Group. We have received your 
               consultation request and a member of our team will be in touch within 
               <strong>one business day</strong> to schedule your free 30-minute strategy call.</p>
               <p>We look forward to learning more about your business and how we can help you grow online.</p>`,
    ctaLabel: 'Explore Our Services', ctaUrl: SITE_URL + '/services.html',
    footNote: 'Questions in the meantime? Email us at ' + REPLY_TO,
  });

  logActivity('consultation', 'New consultation from ' + name + ' (' + business + ')');
  return { success: true, id };
}

// ════════════════════════════════════════════════════════════════
//  ANALYTICS
// ════════════════════════════════════════════════════════════════

function getAnalytics({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  const clients       = getSheetData(SHEETS.CLIENTS);
  const invoices      = getSheetData(SHEETS.INVOICES);
  const reviews       = getSheetData(SHEETS.REVIEWS);
  const referrals     = getSheetData(SHEETS.REFERRALS);
  const mailing       = getSheetData(SHEETS.MAILING);
  const consultations = getSheetData(SHEETS.CONSULTATIONS);
  const activity      = getSheetData(SHEETS.ACTIVITY);

  const activeClients  = clients.filter(c => c.status === 'active');
  const monthlyClients = activeClients.filter(c => c.plan === 'growth');
  const activeProjects = activeClients.filter(
    c => ['consultation','onboarding','design','review'].includes(c.stage)
  );
  const pendingReviews = reviews.filter(r => r.status === 'pending');
  const paidInvoices   = invoices.filter(i => i.status === 'paid');
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid');
  const paidRevenue    = paidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const monthlyRevenue = monthlyClients.length * 50;
  const monthlyPct     = paidRevenue > 0 ? Math.round(monthlyRevenue / paidRevenue * 100) : 70;

  // Outstanding & overdue calculations
  const outstanding    = unpaidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const today          = new Date(); today.setHours(0, 0, 0, 0);
  const overdueInvs    = unpaidInvoices.filter(i => {
    if (!i.dueDate) return false;
    const d = new Date(i.dueDate);
    return !isNaN(d.getTime()) && d < today;
  });

  // This month's paid revenue
  const thisMonth   = today.getMonth();
  const thisYear    = today.getFullYear();
  const paidThisMonth = paidInvoices
    .filter(i => { const d = new Date(i.paidDate || ''); return d.getMonth() === thisMonth && d.getFullYear() === thisYear; })
    .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);

  return {
    success: true,
    totalClients:    activeClients.length,
    monthlyRevenue:  monthlyRevenue,
    activeProjects:  activeProjects.length,
    pendingReviews:  pendingReviews.length,
    monthlyPct:      monthlyPct,
    onetimePct:      100 - monthlyPct,
    paidRevenue:     paidRevenue.toFixed(2),
    outstanding:     outstanding.toFixed(2),
    overdueCount:    overdueInvs.length,
    paidThisMonth:   paidThisMonth.toFixed(2),
    unpaidCount:     unpaidInvoices.length,
    subscribers:     mailing.length,
    consultations:   consultations.length,
    referrals:       referrals.length,
    activity:        activity.slice(-8).reverse().map(a => ({
      text: a.text, time: a.time + ' · ' + a.date, type: a.type,
    })),
  };
}

// ════════════════════════════════════════════════════════════════
//  STRIPE CHECKOUT  (requires STRIPE_SECRET_KEY in Script Properties)
//
//  Setup:
//   1. In Apps Script editor: File → Project Properties → Script Properties
//   2. Add property: STRIPE_SECRET_KEY = sk_live_XXXXXXXX (or sk_test_...)
//   3. Redeploy after adding the property.
//
//  Flow:
//   Admin creates invoice → credit deducted → net amount stored.
//   Client clicks "Pay Now" → createStripeSession called → Stripe session URL returned.
//   Client completes payment → Stripe redirects to success_url with session_id.
//   Client portal calls verifyStripePayment → invoice marked paid in backend.
// ════════════════════════════════════════════════════════════════

const STRIPE_SECRET_KEY_PROP = 'STRIPE_SECRET_KEY';

function createStripeSession({ clientId, invoiceNumber }) {
  if (!clientId || !invoiceNumber) {
    return { success: false, message: 'clientId and invoiceNumber required.' };
  }
  const stripeKey = PropertiesService.getScriptProperties().getProperty(STRIPE_SECRET_KEY_PROP);
  if (!stripeKey) {
    return { success: false, message: 'Stripe API key not configured. Add STRIPE_SECRET_KEY to Script Properties.' };
  }

  const invoices = getSheetData(SHEETS.INVOICES);
  const invoice  = invoices.find(i => i.number === invoiceNumber && i.clientId === clientId);
  if (!invoice)              return { success: false, message: 'Invoice not found.' };
  if (invoice.status === 'paid') return { success: false, message: 'Invoice already paid.' };

  // ── Apply any credits that were added AFTER this invoice was created ─────
  // (Credits applied at invoice creation already reduced invoice.amount.
  //  This handles credits manually added by admin after the fact.)
  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client account not found.' };

  const availableCredit   = parseFloat(client.referralCredit) || 0;
  let   invoiceAmount     = parseFloat(invoice.amount) || 0;
  let   checkoutCreditApplied = 0;

  if (availableCredit > 0 && invoiceAmount > 0) {
    checkoutCreditApplied = Math.min(availableCredit, invoiceAmount);
    invoiceAmount         = Math.max(0, invoiceAmount - checkoutCreditApplied);

    const newClientCredit      = Math.max(0, availableCredit - checkoutCreditApplied);
    const prevCreditApplied    = parseFloat(invoice.creditApplied || '0');
    const totalCreditApplied   = prevCreditApplied + checkoutCreditApplied;

    // Persist changes immediately
    updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
      referralCredit: newClientCredit.toFixed(2),
      lastUpdated:    new Date().toLocaleDateString(),
    });
    updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
      amount:        invoiceAmount.toFixed(2),
      creditApplied: totalCreditApplied.toFixed(2),
    });

    logActivity('credit',
      'Checkout credit applied: -$' + checkoutCreditApplied.toFixed(2) +
      ' on invoice ' + invoiceNumber + ' for ' + client.name +
      ' (remaining balance: $' + newClientCredit.toFixed(2) + ')');
  }

  // ── Fully covered by credit — no Stripe needed ───────────────
  if (invoiceAmount <= 0) {
    updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
      status: 'paid', paidDate: new Date().toLocaleDateString(),
    });
    buildHtmlEmail({
      to: client.email,
      subject: 'Invoice ' + invoiceNumber + ' — Paid in Full by Credit',
      greeting: 'Hi ' + client.name + ',',
      bodyHtml: `<p>Your invoice <strong>${invoiceNumber}</strong> has been fully covered by your available account credit. No payment is due.</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F0FDF4;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px;text-align:center">
                     <p style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#16A34A">
                       $0.00 — Covered by Credit</p>
                     <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#374151">
                       Invoice ${invoiceNumber} · ${invoice.description}</p>
                   </td></tr>
                 </table>`,
      ctaLabel: 'View Your Portal', ctaUrl: SITE_URL + '/client-portal.html',
    });
    buildHtmlEmail({
      to: ADMIN_EMAIL,
      subject: 'Invoice ' + invoiceNumber + ' Covered by Credit — ' + client.name,
      greeting: 'Payment by credit,',
      bodyHtml: `<p><strong>${client.name}</strong>'s invoice <strong>${invoiceNumber}</strong>
                 was fully covered by account credit at checkout.
                 Credit applied at checkout: <strong>$${checkoutCreditApplied.toFixed(2)}</strong>.</p>`,
      ctaLabel: 'View in Admin Portal', ctaUrl: SITE_URL + '/admin-portal.html',
    });
    logActivity('invoice', 'Invoice ' + invoiceNumber + ' fully covered by credit at checkout — auto-marked paid');
    return { success: true, url: null, fullyCovered: true, creditApplied: checkoutCreditApplied.toFixed(2) };
  }

  // ── Build Stripe checkout session ────────────────────────────
  const totalCreditAppliedFinal = parseFloat(invoice.creditApplied || '0') + checkoutCreditApplied -
    (checkoutCreditApplied > 0 ? 0 : 0); // already updated above
  // Re-read to get accurate value after update
  const updatedInvoice = getSheetData(SHEETS.INVOICES).find(i => i.number === invoiceNumber);
  const totalCreditNote = parseFloat(updatedInvoice ? updatedInvoice.creditApplied : invoice.creditApplied || '0');

  const creditNote  = totalCreditNote > 0
    ? ' (after $' + totalCreditNote.toFixed(2) + ' referral credit applied)'
    : '';
  const productName = 'CWO Strategy Group — ' + invoice.description + creditNote;

  const successUrl = SITE_URL + '/client-portal.html'
    + '?payment_success=' + encodeURIComponent(invoiceNumber)
    + '&stripe_session={CHECKOUT_SESSION_ID}';
  const cancelUrl  = SITE_URL + '/client-portal.html';

  const payload = [
    'mode=payment',
    'line_items[0][price_data][currency]=usd',
    'line_items[0][price_data][unit_amount]=' + Math.round(invoiceAmount * 100),
    'line_items[0][price_data][product_data][name]=' + encodeURIComponent(productName),
    'line_items[0][quantity]=1',
    'success_url=' + encodeURIComponent(successUrl),
    'cancel_url='  + encodeURIComponent(cancelUrl),
    'metadata[invoiceNumber]=' + encodeURIComponent(invoiceNumber),
    'metadata[clientId]='      + encodeURIComponent(clientId),
    'payment_intent_data[description]=' + encodeURIComponent('CWO Invoice ' + invoiceNumber),
  ];
  if (client && client.email) {
    payload.push('customer_email=' + encodeURIComponent(client.email));
  }

  try {
    const response = UrlFetchApp.fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'post',
      headers: {
        'Authorization':  'Bearer ' + stripeKey,
        'Content-Type':   'application/x-www-form-urlencoded',
      },
      payload:            payload.join('&'),
      muteHttpExceptions: true,
    });

    const data = JSON.parse(response.getContentText());
    if (data.error) {
      Logger.log('Stripe createSession error: ' + JSON.stringify(data.error));

      // ── Rollback credit changes on Stripe failure ────────────
      if (checkoutCreditApplied > 0) {
        updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
          referralCredit: availableCredit.toFixed(2),
          lastUpdated:    new Date().toLocaleDateString(),
        });
        const originalAmount         = parseFloat(invoice.amount) + checkoutCreditApplied;
        const originalCreditApplied  = parseFloat(invoice.creditApplied || '0');
        updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
          amount:        originalAmount.toFixed(2),
          creditApplied: originalCreditApplied.toFixed(2),
        });
        logActivity('credit', 'Checkout credit rollback for ' + invoiceNumber + ' — Stripe session failed');
      }

      return { success: false, message: data.error.message || 'Stripe checkout creation failed.' };
    }

    // ── Store stripe session ID in invoice ───────────────────
    updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
      stripeSessionId: data.id,
    });

    logActivity('invoice', 'Stripe checkout session created for invoice ' + invoiceNumber
      + ' ($' + invoiceAmount.toFixed(2) + ')'
      + (checkoutCreditApplied > 0 ? ' with $' + checkoutCreditApplied.toFixed(2) + ' credit applied' : ''));
    return {
      success:      true,
      url:          data.url,
      sessionId:    data.id,
      creditApplied: checkoutCreditApplied.toFixed(2),
      chargedAmount: invoiceAmount.toFixed(2),
    };
  } catch (err) {
    Logger.log('createStripeSession exception: ' + err.toString());

    // Rollback on exception too
    if (checkoutCreditApplied > 0) {
      try {
        updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
          referralCredit: availableCredit.toFixed(2),
          lastUpdated:    new Date().toLocaleDateString(),
        });
        const originalAmount = parseFloat(invoice.amount) + checkoutCreditApplied;
        updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
          amount:        originalAmount.toFixed(2),
          creditApplied: parseFloat(invoice.creditApplied || '0').toFixed(2),
        });
      } catch (rollbackErr) {
        Logger.log('Rollback failed: ' + rollbackErr.toString());
      }
    }

    return { success: false, message: 'Failed to create Stripe checkout: ' + err.toString() };
  }
}

/**
 * verifyStripePayment — called by client portal after redirect from Stripe success_url.
 * Verifies the session via Stripe API (if key available), then marks the invoice paid.
 */
function verifyStripePayment({ clientId, invoiceNumber, sessionId }) {
  if (!invoiceNumber || !sessionId) {
    return { success: false, message: 'invoiceNumber and sessionId required.' };
  }

  const stripeKey = PropertiesService.getScriptProperties().getProperty(STRIPE_SECRET_KEY_PROP);

  if (stripeKey) {
    try {
      const response = UrlFetchApp.fetch(
        'https://api.stripe.com/v1/checkout/sessions/' + encodeURIComponent(sessionId),
        { method: 'get', headers: { 'Authorization': 'Bearer ' + stripeKey }, muteHttpExceptions: true }
      );
      const session = JSON.parse(response.getContentText());

      if (session.error) {
        Logger.log('Stripe verify error: ' + JSON.stringify(session.error));
        return { success: false, message: 'Could not verify payment with Stripe: ' + session.error.message };
      }
      if (session.payment_status !== 'paid') {
        return { success: false, message: 'Payment not confirmed — status: ' + session.payment_status };
      }
      // Ensure session belongs to this invoice
      if (session.metadata && session.metadata.invoiceNumber &&
          session.metadata.invoiceNumber !== invoiceNumber) {
        return { success: false, message: 'Session/invoice mismatch.' };
      }
    } catch (err) {
      Logger.log('verifyStripePayment Stripe check exception: ' + err.toString());
      // Stripe API unavailable — proceed to mark paid based on session ID existing
    }
  }

  // Mark invoice paid
  const invoices = getSheetData(SHEETS.INVOICES);
  const invoice  = invoices.find(i => i.number === invoiceNumber);
  if (!invoice)           return { success: false, message: 'Invoice not found.' };
  if (invoice.status === 'paid') return { success: true, alreadyPaid: true }; // idempotent

  const updated = updateRowByField(SHEETS.INVOICES, 'number', invoiceNumber, {
    status: 'paid', paidDate: new Date().toLocaleDateString(),
    stripeSessionId: sessionId || '',
  });
  if (!updated) return { success: false, message: 'Invoice update failed.' };

  const client = clientId ? getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId) : null;

  if (client) {
    buildHtmlEmail({
      to: client.email,
      subject: 'Payment Received — Invoice ' + invoiceNumber + ' — CWO Strategy Group',
      greeting: 'Hi ' + client.name + ',',
      bodyHtml: `<p>Your payment for invoice <strong>${invoiceNumber}</strong> has been received and confirmed via Stripe.</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F0FDF4;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px;text-align:center">
                     <p style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#16A34A">
                       $${parseFloat(invoice.amount).toFixed(2)} Paid</p>
                     <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#374151">
                       Invoice ${invoiceNumber} · ${invoice.description}</p>
                   </td></tr>
                 </table>
                 <p style="color:#6B7280;font-size:13px">Thank you for your payment. Your invoice has been marked as paid in your client portal.</p>`,
      ctaLabel: 'View Your Portal', ctaUrl: SITE_URL + '/client-portal.html',
    });
    buildHtmlEmail({
      to: ADMIN_EMAIL,
      subject: 'Stripe Payment Received — ' + client.name + ' — Invoice ' + invoiceNumber,
      greeting: 'Payment confirmed,',
      bodyHtml: `<p><strong>${client.name}</strong> paid invoice <strong>${invoiceNumber}</strong>
                 ($${parseFloat(invoice.amount || 0).toFixed(2)}) via Stripe checkout.</p>
                 <p style="color:#6B7280;font-size:13px">Stripe session ID: ${sessionId}</p>`,
      ctaLabel: 'View in Admin Portal', ctaUrl: SITE_URL + '/admin-portal.html',
    });
  }

  logActivity('invoice', 'Invoice ' + invoiceNumber + ' paid via Stripe' +
    (client ? ' by ' + client.name : ''));
  return { success: true };
}

// ════════════════════════════════════════════════════════════════
//  OUTSTANDING BALANCE (client + admin)
// ════════════════════════════════════════════════════════════════

/**
 * getOutstandingBalance — returns the client's total unpaid invoice amount,
 * count of unpaid invoices, count of overdue invoices, and current credit balance.
 * Used by the client portal dashboard and invoice section.
 */
function getOutstandingBalance({ clientId }) {
  if (!clientId) return { success: false, message: 'clientId required.' };

  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };

  const invoices = getSheetData(SHEETS.INVOICES).filter(i => i.clientId === clientId);
  const unpaid   = invoices.filter(i => i.status !== 'paid');
  const today    = new Date();
  today.setHours(0, 0, 0, 0);

  let totalOutstanding = 0;
  let overdueCount     = 0;
  unpaid.forEach(inv => {
    const amt = parseFloat(inv.amount) || 0;
    totalOutstanding += amt;
    if (inv.dueDate) {
      const due = new Date(inv.dueDate);
      if (!isNaN(due.getTime()) && due < today) overdueCount++;
    }
  });

  const creditBalance = parseFloat(client.referralCredit) || 0;
  // How much of the outstanding balance would be covered by current credit
  const creditCovers  = Math.min(creditBalance, totalOutstanding);

  return {
    success:          true,
    totalOutstanding: totalOutstanding.toFixed(2),
    unpaidCount:      unpaid.length,
    overdueCount:     overdueCount,
    creditBalance:    creditBalance.toFixed(2),
    creditCovers:     creditCovers.toFixed(2),
    netAfterCredit:   Math.max(0, totalOutstanding - creditBalance).toFixed(2),
  };
}

// ════════════════════════════════════════════════════════════════
//  CREDIT MANAGEMENT
// ════════════════════════════════════════════════════════════════

/**
 * adjustCredit — admin can manually add or deduct credit from a client's account.
 * Positive amount = add credit. Negative amount = deduct (floored at 0).
 */
function adjustCredit({ adminToken, clientId, amount, note }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!clientId || amount === undefined || amount === null) {
    return { success: false, message: 'clientId and amount required.' };
  }
  const adjustment = parseFloat(amount);
  if (isNaN(adjustment)) return { success: false, message: 'amount must be a number.' };

  const client = getSheetData(SHEETS.CLIENTS).find(c => c.id === clientId);
  if (!client) return { success: false, message: 'Client not found.' };

  const currentCredit = parseFloat(client.referralCredit) || 0;
  const newCredit     = Math.max(0, currentCredit + adjustment);

  const updated = updateRowByField(SHEETS.CLIENTS, 'id', clientId, {
    referralCredit: newCredit.toFixed(2),
    lastUpdated:    new Date().toLocaleDateString(),
  });
  if (!updated) return { success: false, message: 'Update failed.' };

  if (adjustment > 0) {
    buildHtmlEmail({
      to: client.email,
      subject: '$' + adjustment.toFixed(2) + ' Credit Added to Your Account — CWO Strategy Group',
      greeting: 'Hi ' + client.name + ',',
      bodyHtml: `<p>A credit of <strong>$${adjustment.toFixed(2)}</strong> has been added to your account${note ? ': <em>' + note + '</em>' : ''}.</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F0FDF4;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px;text-align:center">
                     <p style="margin:0;font-family:Georgia,serif;font-size:28px;font-weight:700;color:#16A34A">
                       $${newCredit.toFixed(2)}</p>
                     <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#374151">
                       New account credit balance</p>
                   </td></tr>
                 </table>
                 <p>Your credit will be automatically applied to your next invoice.</p>`,
      ctaLabel: 'View Your Portal', ctaUrl: SITE_URL + '/client-portal.html',
    });
  }

  logActivity('credit',
    'Credit adjusted for ' + client.name + ': ' +
    (adjustment >= 0 ? '+' : '') + adjustment.toFixed(2) +
    ' → new balance: $' + newCredit.toFixed(2) +
    (note ? ' (' + note + ')' : ''));

  return {
    success: true,
    previousCredit: currentCredit.toFixed(2),
    newCredit:      newCredit.toFixed(2),
  };
}

// ════════════════════════════════════════════════════════════════
//  CONSULTATIONS (admin view)
// ════════════════════════════════════════════════════════════════

function getConsultations({ adminToken }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  const consultations = getSheetData(SHEETS.CONSULTATIONS).map(c => ({
    id:           c.id,
    name:         c.name,
    email:        c.email,
    phone:        c.phone        || '',
    business:     c.business,
    website:      c.website      || '',
    service:      c.service,
    budget:       c.budget       || '',
    message:      c.message,
    referralCode: c.referralCode || '',
    submittedAt:  c.submittedAt,
  }));
  // newest first
  consultations.reverse();
  return { success: true, consultations };
}

// ════════════════════════════════════════════════════════════════
//  ADMIN EMAIL COMPOSER
// ════════════════════════════════════════════════════════════════

function sendAdminEmail({ adminToken, to, subject, bodyHtml, ctaLabel, ctaUrl }) {
  if (adminToken !== ADMIN_TOKEN) return { success: false, message: 'Unauthorized.' };
  if (!to || !subject || !bodyHtml) {
    return { success: false, message: 'to, subject, and bodyHtml required.' };
  }
  const recipients = to.split(',').map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  if (!recipients.length) return { success: false, message: 'No valid email addresses found.' };
  recipients.forEach(r => {
    buildHtmlEmail({ to: r, subject: subject.trim(), greeting: '', bodyHtml, ctaLabel: ctaLabel || '', ctaUrl: ctaUrl || '' });
  });
  logActivity('email', 'Admin email "' + subject + '" sent to ' + recipients.join(', '));
  return { success: true, sent: recipients.length };
}

// ════════════════════════════════════════════════════════════════
//  TIME-DRIVEN TRIGGER: Monthly Invoices
//  Triggers → Add Trigger → generateMonthlyInvoices → Month timer → Day 1
// ════════════════════════════════════════════════════════════════

function generateMonthlyInvoices() {
  const clients = getSheetData(SHEETS.CLIENTS);
  const monthly = clients.filter(c => c.status === 'active' && c.plan === 'growth');
  const now     = new Date();
  const month   = now.toLocaleString('en-US', { month: 'long' });
  const year    = now.getFullYear();
  const dueDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7).toLocaleDateString();

  monthly.forEach(client => {
    // Re-use createInvoice logic (without adminToken check) to get credit auto-applied
    const existing     = getSheetData(SHEETS.INVOICES);
    const number       = 'INV-' + String(existing.length + 1).padStart(3, '0');
    let   rawAmount    = 50;
    let   creditApplied = 0;
    const credit       = parseFloat(client.referralCredit) || 0;

    if (credit > 0) {
      creditApplied = Math.min(credit, rawAmount);
      rawAmount     = Math.max(0, rawAmount - creditApplied);
      updateRowByField(SHEETS.CLIENTS, 'id', client.id, {
        referralCredit: Math.max(0, credit - creditApplied).toFixed(2),
        lastUpdated:    now.toLocaleDateString(),
      });
    }

    appendRow(SHEETS.INVOICES, [
      number, client.id, client.name,
      'Monthly Growth Plan — ' + month + ' ' + year,
      rawAmount.toFixed(2), rawAmount === 0 ? 'paid' : 'due',
      dueDate, '', '', now.toLocaleDateString(), creditApplied.toFixed(2),
    ]);

    buildHtmlEmail({
      to: client.email, subject: 'Invoice ' + number + ' — ' + month + ' ' + year,
      greeting: 'Hi ' + client.name + ',',
      bodyHtml: `<p>Your monthly invoice for <strong>${month} ${year}</strong> is now available.</p>
                 <table role="presentation" cellpadding="0" cellspacing="0"
                   style="background:#F2F4F8;border-radius:6px;width:100%;margin:16px 0">
                   <tr><td style="padding:20px 24px;text-align:center">
                     <p style="margin:0;font-family:Georgia,serif;font-size:28px;
                       font-weight:700;color:${rawAmount===0?'#16A34A':'#C9A84C'}">
                       ${rawAmount===0?'$0.00 — Covered by credit':'$'+rawAmount.toFixed(2)}</p>
                     <p style="margin:6px 0 0;font-family:Arial,sans-serif;font-size:13px;color:#6B7280">
                       Monthly Growth Plan — ${month} ${year}<br>Due: ${dueDate}
                       ${creditApplied>0?'<br><span style="color:#16A34A">$'+creditApplied.toFixed(2)+' referral credit applied</span>':''}</p>
                   </td></tr>
                 </table>`,
      ctaLabel: rawAmount === 0 ? 'View Your Portal' : 'Pay Now',
      ctaUrl:   SITE_URL + '/client-portal.html',
    });
  });

  logActivity('invoice', 'Auto-generated ' + monthly.length + ' invoices for ' + month + ' ' + year);
  Logger.log('Generated ' + monthly.length + ' invoices for ' + month + ' ' + year);
}
