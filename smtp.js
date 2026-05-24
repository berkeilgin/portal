/* SmtpJS.com — Fixed v2: her zaman Promise döndürür, response kontrolü yok */
var Email = {

  send: function (config) {

    // Eski positional API desteği → object'e çevir
    if (typeof config !== 'object') {
      config = {
        From:     arguments[0],
        To:       arguments[1],
        Subject:  arguments[2],
        Body:     arguments[3],
        Host:     arguments[4],
        Username: arguments[5],
        Password: arguments[6]
      };
    }

    return new Promise(function (resolve, reject) {

      var url = 'https://smtpjs.com/smtp.aspx?';
      url += 'From='     + encodeURIComponent(config.From    || '');
      url += '&to='      + encodeURIComponent(config.To      || '');
      url += '&Subject=' + encodeURIComponent(config.Subject || '');
      url += '&Body='    + encodeURIComponent(config.Body    || '');

      if (config.Cc)  url += '&Cc='  + encodeURIComponent(config.Cc);
      if (config.Bcc) url += '&Bcc=' + encodeURIComponent(config.Bcc);

      if (config.SecureToken) {
        url += '&SecureToken=' + config.SecureToken;
        url += '&Action=SendFromStored';
      } else {
        url += '&Host='     + encodeURIComponent(config.Host     || 'smtp.gmail.com');
        url += '&Username=' + encodeURIComponent(config.Username || '');
        url += '&Password=' + encodeURIComponent(config.Password || '');
        url += '&Action=Send';
      }

      url += '&cachebuster=' + Math.floor(Math.random() * 1e6 + 1);

      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);

      xhr.onload = function () {
        // smtpjs "OK" dönerse başarılı, ama her halükarda resolve et
        // reject etmiyoruz — çağıran kod responseText'i kontrol edebilir
        resolve(xhr.responseText || 'OK');
      };

      xhr.onerror = function () {
        reject('Ağ hatası: smtpjs.com\'a erişilemiyor.');
      };

      xhr.ontimeout = function () {
        reject('Zaman aşımı.');
      };

      xhr.timeout = 15000; // 15 saniye
      xhr.send();
    });
  }

};
