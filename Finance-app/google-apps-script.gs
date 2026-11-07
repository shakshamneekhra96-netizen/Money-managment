/**
 * MyFinance ↔ Google Sheets sync web app.
 *
 * HOW TO DEPLOY (one time, no Google Cloud setup needed):
 *   1. Open your spreadsheet → Extensions → Apps Script.
 *   2. Delete any code in Code.gs, paste this whole file, press Save.
 *   3. Deploy → New deployment → Select type: Web app.
 *        - Description: MyFinance sync
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   4. Authorize when asked (it only touches this spreadsheet).
 *   5. Copy the Web app URL (ends with /exec) into
 *      MyFinance → Settings → Google Sheets sync → Script web app URL.
 *
 * The app creates/reuses tabs named Transactions, Categories, People, …
 * and never touches your other tabs.
 */

function doGet() {
  return respond_({ ok: true, message: 'MyFinance sync is running. The app uses POST requests.' });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'ping') return respond_({ ok: true, message: 'pong' });
    if (body.action === 'push') return respond_(push_(body));
    if (body.action === 'pull') return respond_(pull_());
    return respond_({ ok: false, message: 'Unknown action: ' + body.action });
  } catch (error) {
    return respond_({ ok: false, message: String(error) });
  }
}

function push_(body) {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = body.sheets || [];
  sheets.forEach(function (sheet) {
    var tab = spreadsheet.getSheetByName(sheet.name) || spreadsheet.insertSheet(sheet.name);
    var lastRow = tab.getLastRow();
    var lastCol = tab.getLastColumn();
    if (lastRow > 0 && lastCol > 0) tab.getRange(1, 1, lastRow, lastCol).clearContent();
    var rows = sheet.values.length;
    var cols = 0;
    sheet.values.forEach(function (row) {
      if (row.length > cols) cols = row.length;
    });
    if (rows === 0 || cols === 0) return;
    for (var i = 0; i < rows; i++) {
      while (sheet.values[i].length < cols) sheet.values[i].push('');
    }
    tab.getRange(1, 1, rows, cols).setValues(sheet.values);
  });
  return { ok: true, message: 'Wrote ' + sheets.length + ' sheets.' };
}

function pull_() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = {};
  spreadsheet.getSheets().forEach(function (tab) {
    var lastRow = tab.getLastRow();
    var lastCol = tab.getLastColumn();
    if (lastRow < 1 || lastCol < 1) return;
    var values = tab.getRange(1, 1, lastRow, lastCol).getValues();
    for (var r = 0; r < values.length; r++) {
      for (var c = 0; c < values[r].length; c++) {
        var v = values[r][c];
        if (v instanceof Date) {
          if (v.getHours() === 0 && v.getMinutes() === 0 && v.getSeconds() === 0) {
            values[r][c] = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
          } else {
            values[r][c] = Utilities.formatDate(v, Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ss");
          }
        } else if (typeof v === 'boolean' || typeof v === 'number') {
          values[r][c] = v;
        } else {
          values[r][c] = String(v);
        }
      }
    }
    sheets[tab.getName()] = values;
  });
  return { ok: true, sheets: sheets };
}

function respond_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
