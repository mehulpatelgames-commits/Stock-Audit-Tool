function doGet() {
  return HtmlService.createHtmlOutputFromFile('index');
}

// FETCH DATA
function getStockData() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");
  var data = sheet.getDataRange().getValues();

  var result = [];

  for (var i = 1; i < data.length; i++) {
    result.push({
      row: i + 1,
      marking: data[i][0],
      rollNo: data[i][1],
      quality: data[i][2],
      reqgsm: data[i][3],
      metre: data[i][4],
      gross: data[i][5],
      net: data[i][6],
      stand: data[i][7],
      remark: data[i][8],
      verify: data[i][9],
      physical: data[i][10]
    });
  }

  return result;
}

// SAVE STOCK
function updateStock(rowNumber, verified, physicalQty, remark, userName) {

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");

  physicalQty = Number(physicalQty);

  sheet.getRange(rowNumber, 9).setValue(remark);
  sheet.getRange(rowNumber, 10).setValue(verified);
  sheet.getRange(rowNumber, 11).setValue(physicalQty);
  sheet.getRange(rowNumber, 12).setValue(userName);

  return "Saved";
}

// ADD STOCK
function addNewStock(data, userName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Stock");

  sheet.appendRow([
    data.marking,
    data.rollNo,
    data.quality,
    data.reqgsm,
    data.metre,
    data.gross,
    data.net,
    data.stand,
    data.remark,
    true,
    data.physical,
    userName
  ]);

  return "Added";
}

// ✅ FIXED PHOTO UPLOAD
function uploadPhoto(base64Data, fileName, userName, remark) {

  try {

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var file = DriveApp.getFileById(ss.getId());
    var folder = file.getParents().next();

    var contentType = base64Data.substring(base64Data.indexOf(":") + 1, base64Data.indexOf(";"));
    var base64 = base64Data.split(",")[1];

    var bytes = Utilities.base64Decode(base64);
    var finalName = new Date().getTime() + "_" + fileName;

    var blob = Utilities.newBlob(bytes, contentType, finalName);
    var uploadedFile = folder.createFile(blob);
    var url = uploadedFile.getUrl();

    // ✅ AUTO CREATE SHEET IF NOT EXISTS
    var sheet = ss.getSheetByName("PhotoLog");
    if (!sheet) {
      sheet = ss.insertSheet("PhotoLog");
      sheet.appendRow(["Photo URL", "User", "Remark", "Timestamp"]);
    }

    sheet.appendRow([url, userName, remark, new Date()]);

    return "Uploaded Successfully";

  } catch (e) {
    throw new Error("Upload failed: " + e.message);
  }
}