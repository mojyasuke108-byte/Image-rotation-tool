/**
 * Google Drive 画像回転ツール v2
 *
 * 対応形式: JPEG, PNG, GIF, BMP, WebP, TIFF, PDF
 *
 * セットアップ:
 * 1. script.google.com で新規プロジェクト作成
 * 2. Code.gs と index.html を設定
 * 3. サービス「+」→ Drive API を追加
 * 4. デプロイ → ウェブアプリ（自分として実行 / 自分のみ）
 * 5. Driveの「アプリで開く」連携は別途GCP設定が必要（README参照）
 */

function doGet(e) {
  var fileId = '';

  // Drive「アプリで開く」→ state パラメータにファイルIDが入る
  if (e && e.parameter && e.parameter.state) {
    try {
      var state = JSON.parse(e.parameter.state);
      if (state.ids && state.ids.length > 0) {
        fileId = state.ids[0];
      }
    } catch (_) {}
  }

  // ?fileId=xxx にも対応
  if (!fileId && e && e.parameter && e.parameter.fileId) {
    fileId = e.parameter.fileId;
  }

  var template = HtmlService.createTemplateFromFile('index');
  template.initialFileId = fileId;

  return template.evaluate()
    .setTitle('Drive 画像回転ツール')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ファイルの生バイトを Base64 で返す（TIF/PDF 含む）
 */
function getImageData(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    var blob = file.getBlob();
    var parents = file.getParents();
    return {
      success: true,
      data: Utilities.base64Encode(blob.getBytes()),
      mimeType: blob.getContentType(),
      name: file.getName(),
      parentFolderId: parents.hasNext() ? parents.next().getId() : ''
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 単一ファイル情報（Drive直接起動用）
 */
function getFileInfo(fileId) {
  try {
    var file = DriveApp.getFileById(fileId);
    return {
      success: true,
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      parentFolderId: (function() {
        var p = file.getParents();
        return p.hasNext() ? p.next().getId() : '';
      })()
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * 回転済みデータで上書き保存
 * @param {string} fileId
 * @param {string} base64Data  data:mime;base64,... 形式
 */
function saveRotatedImage(fileId, base64Data) {
  try {
    var parts = base64Data.split(',');
    var mimeMatch = parts[0].match(/data:(.*?);/);
    var dataMime = mimeMatch ? mimeMatch[1] : 'image/png';
    var decoded = Utilities.base64Decode(parts[1]);

    var file = DriveApp.getFileById(fileId);
    var fileName = file.getName();
    var blob = Utilities.newBlob(decoded, dataMime, fileName);

    // Drive Advanced Service で上書き
    try {
      Drive.Files.update({ title: fileName }, fileId, blob);
    } catch (_) {
      // フォールバック: 旧ファイル→ゴミ箱、同フォルダに再作成
      var parents = file.getParents();
      var parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
      file.setTrashed(true);
      var nf = parentFolder.createFile(blob);
      nf.setName(fileName);
      return { success: true, message: fileName, newFileId: nf.getId() };
    }

    return { success: true, message: fileName };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
