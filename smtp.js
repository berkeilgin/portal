/* SmtpJS.com — Fixed: object API + Promise support */
var Email = {

  send: function (config) {

    // ── Eski positional API desteği ──────────────────────────────────
    // Email.send(From, To, Subject, Body, Host, Username, Password)
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

    // ── Promise döndür ───────────────────────────────────────────────
    return new Promise(function (resolve, reject) {

      var cacheBuster = Math.floor(Math.random() * 1e6 + 1);
      var url = 'https://smtpjs.com/smtp.aspx?';

      url += 'From='    + encodeURIComponent(config.From    || '');
      url += '&to='     + encodeURIComponent(config.To      || '');
      url += '&Subject='+ encodeURIComponent(config.Subject || '');
      url += '&Body='   + encodeURIComponent(config.Body    || '');

      if (config.Cc)  url += '&Cc='  + encodeURIComponent(config.Cc);
      if (config.Bcc) url += '&Bcc=' + encodeURIComponent(config.Bcc);

      // SecureToken modu (smtpjs.com encrypted token)
      if (config.SecureToken) {
        url += '&SecureToken=' + config.SecureToken;
        url += '&Action=SendFromStored';
      } else {
        // Plain credentials modu (Gmail App Password)
        url += '&Host='     + encodeURIComponent(config.Host     || 'smtp.gmail.com');
        url += '&Username=' + encodeURIComponent(config.Username || '');
        url += '&Password=' + encodeURIComponent(config.Password || '');
        url += '&Action=Send';
      }

      url += '&cachebuster=' + cacheBuster;

      var xhr = Email._createRequest('GET', url);

      if (!xhr) {
        reject('CORS desteklenmiyor.');
        return;
      }

      xhr.onload = function () {
        var response = xhr.responseText;
        // smtpjs "OK" döndürürse başarılı
        if (response && response.toUpperCase().indexOf('OK') !== -1) {
          resolve(response);
        } else {
          reject(response || 'Bilinmeyen hata');
        }
      };

      xhr.onerror = function () {
        reject('Ağ hatası — smtpjs.com erişilemiyor.');
      };

      xhr.send();
    });
  },

  // ── XHR yardımcısı ─────────────────────────────────────────────────
  _createRequest: function (method, url) {
    var xhr = new XMLHttpRequest();
    if ('withCredentials' in xhr) {
      xhr.open(method, url, true);
      return xhr;
    }
    if (typeof XDomainRequest !== 'undefined') {
      xhr = new XDomainRequest();
      xhr.open(method, url);
      return xhr;
    }
    return null;
  }

};
