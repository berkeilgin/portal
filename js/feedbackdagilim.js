// Feedback Dağılım - Ana Kontrol Modülü
// Zorunlu kolonlar: "Ident" ve "Monitoring ID"

(function() {
    // DOM Elements
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const resetBtn = document.getElementById('resetBtn');
    const loading = document.getElementById('loading');
    const previewSection = document.getElementById('previewSection');
    const errorList = document.getElementById('errorList');
    const stepInfo = document.getElementById('stepInfo');
    const totalCountSpan = document.getElementById('totalCount');
    const errorCountSpan = document.getElementById('errorCount');
    const validCountSpan = document.getElementById('validCount');
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    const errorItems = document.getElementById('errorItems');
    const identList = document.getElementById('identList');
    const fileInfo = document.getElementById('fileInfo');
    const missingWarning = document.getElementById('missingWarning');

    let currentData = [];
    let currentHeaders = [];
    let identColumnIndex = -1;
    let monitoringColumnIndex = -1;

    // Monitoring ID Validation - sadece 8 haneli numerik
    function validateMonitoringId(value) {
        if (value === null || value === undefined || value === '') {
            return { valid: false, reason: 'Boş değer' };
        }
        const strValue = String(value).trim();
        if (strValue === '') {
            return { valid: false, reason: 'Boşluk içeriyor' };
        }
        if (!/^\d+$/.test(strValue)) {
            return { valid: false, reason: 'Numerik değer içermiyor (sadece rakam olmalı)' };
        }
        if (strValue.length !== 8) {
            return { valid: false, reason: `${strValue.length} haneli (8 haneli olmalı)` };
        }
        return { valid: true, reason: '' };
    }

    // Dinamik link oluşturma
    function generateLink(ident) {
        if (!ident || ident.trim() === '') return '#';
        const baseUrl = 'https://sebra.ccms.teleperformance.com/ccms-bin/console/tops/checklist.pl';
        return `${baseUrl}?frmTarget=CHECKLIST&checklist_ident=${encodeURIComponent(ident.trim())}&frmOption=OPTION`;
    }

    // CSV satırı ayrıştırma (tırnak içindeki virgülleri koruyarak)
    function parseCSVLine(line) {
        const result = [];
        let inQuotes = false;
        let current = '';
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        
        return result.map(field => {
            if (field.startsWith('"') && field.endsWith('"')) {
                return field.slice(1, -1);
            }
            return field;
        });
    }

    // Tam CSV ayrıştırma
    function parseCSV(text) {
        const lines = text.split(/\r?\n/);
        if (lines.length === 0) return { headers: [], data: [] };
        
        const headers = parseCSVLine(lines[0]);
        const data = [];
        
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') continue;
            data.push(parseCSVLine(lines[i]));
        }
        
        return { headers, data };
    }

    // Zorunlu kolonları kontrol et
    function checkRequiredColumns(headers) {
        const identIndex = headers.findIndex(h => h === 'Ident');
        const monitoringIndex = headers.findIndex(h => h === 'Monitoring ID');
        
        const missing = [];
        if (identIndex === -1) missing.push('Ident');
        if (monitoringIndex === -1) missing.push('Monitoring ID');
        
        return {
            hasAllRequired: missing.length === 0,
            missing,
            identIndex,
            monitoringIndex
        };
    }

    // Veriyi işle ve doğrula
    function processData(headers, data) {
        const { identIndex, monitoringIndex } = checkRequiredColumns(headers);
        
        if (identIndex === -1 || monitoringIndex === -1) {
            throw new Error('Zorunlu kolonlar eksik: Ident ve/veya Monitoring ID bulunamadı');
        }
        
        const validatedData = [];
        const errors = [];
        
        for (let i = 0; i < data.length; i++) {
            const row = data[i];
            const monitoringValue = monitoringIndex < row.length ? row[monitoringIndex] : '';
            const identValue = identIndex < row.length ? row[identIndex] : '';
            
            const validation = validateMonitoringId(monitoringValue);
            
            validatedData.push({
                rowIndex: i + 1,
                originalRow: row,
                monitoringId: monitoringValue,
                ident: identValue,
                valid: validation.valid,
                errorReason: validation.reason
            });
            
            if (!validation.valid) {
                errors.push({
                    row: i + 1,
                    monitoringId: monitoringValue,
                    reason: validation.reason,
                    ident: identValue
                });
            }
        }
        
        return { validatedData, errors, identIndex, monitoringIndex };
    }

    // HTML escape
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Tablo gösterimi
    function renderTable(validatedData, headers) {
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';
        
        if (!headers || headers.length === 0) return;
        
        // Header satırı
        const headerRow = document.createElement('tr');
        headers.forEach((header) => {
            const th = document.createElement('th');
            th.textContent = header;
            if (header === 'Monitoring ID') {
                th.style.backgroundColor = '#dc3545';
                th.title = 'Zorunlu kolon - 8 haneli numerik değer olmalı';
            }
            if (header === 'Ident') {
                th.style.backgroundColor = '#28a745';
                th.title = 'Zorunlu kolon - Link oluşturmak için kullanılır';
            }
            headerRow.appendChild(th);
        });
        // Durum kolonu
        const statusTh = document.createElement('th');
        statusTh.textContent = 'Monitoring ID Durumu';
        statusTh.style.backgroundColor = '#17a2b8';
        headerRow.appendChild(statusTh);
        tableHeader.appendChild(headerRow);
        
        // Veri satırları
        validatedData.forEach(item => {
            const row = document.createElement('tr');
            if (!item.valid) {
                row.classList.add('error-row');
            }
            
            headers.forEach((header, idx) => {
                const td = document.createElement('td');
                let cellValue = idx < item.originalRow.length ? item.originalRow[idx] : '';
                
                if (header === 'Monitoring ID' && !item.valid) {
                    td.innerHTML = `<span class="error-badge"><i class="fas fa-times"></i> ${escapeHtml(cellValue) || '(boş)'}</span>`;
                } else if (header === 'Ident' && cellValue) {
                    const link = generateLink(cellValue);
                    td.innerHTML = `<a href="${link}" target="_blank" class="link-btn"><i class="fas fa-external-link-alt"></i> ${escapeHtml(cellValue)}</a>`;
                } else {
                    td.textContent = cellValue;
                }
                row.appendChild(td);
            });
            
            // Durum kolonu
            const statusTd = document.createElement('td');
            if (item.valid) {
                statusTd.innerHTML = '<span class="valid-badge"><i class="fas fa-check-circle"></i> Geçerli (8 hane)</span>';
            } else {
                statusTd.innerHTML = `<span class="error-badge"><i class="fas fa-exclamation-circle"></i> Hata: ${item.errorReason}</span>`;
            }
            row.appendChild(statusTd);
            tableBody.appendChild(row);
        });
    }

    // Hata listesi gösterimi
    function renderErrorList(errors) {
        errorItems.innerHTML = '';
        if (errors.length > 0) {
            errors.forEach(err => {
                const li = document.createElement('li');
                let identLink = '';
                if (err.ident && err.ident.trim()) {
                    const link = generateLink(err.ident);
                    identLink = `<a href="${link}" target="_blank"><i class="fas fa-link"></i> Ident: ${escapeHtml(err.ident)}</a>`;
                }
                li.innerHTML = `<i class="fas fa-bug" style="color:#dc3545"></i> <strong>Satır ${err.row}</strong> | Monitoring ID: "${escapeHtml(err.monitoringId)}" | <span style="color:#dc3545">${err.reason}</span> ${identLink}`;
                errorItems.appendChild(li);
            });
            errorList.style.display = 'block';
        } else {
            errorList.style.display = 'none';
        }
    }

    // Ident linkleri (Step 1)
    function renderIdentLinks(validatedData) {
        identList.innerHTML = '';
        const uniqueIdents = [...new Set(validatedData.map(item => item.ident).filter(id => id && id.trim()))];
        
        if (uniqueIdents.length > 0) {
            uniqueIdents.forEach(ident => {
                const link = generateLink(ident);
                const badge = document.createElement('a');
                badge.href = link;
                badge.target = '_blank';
                badge.className = 'link-btn';
                badge.style.padding = '8px 15px';
                badge.style.margin = '5px';
                badge.innerHTML = `<i class="fas fa-link"></i> ${escapeHtml(ident)}`;
                identList.appendChild(badge);
            });
            stepInfo.style.display = 'block';
        } else {
            stepInfo.style.display = 'none';
        }
    }

    // İstatistik güncelleme
    function updateStats(total, errorCount, validCount) {
        totalCountSpan.textContent = total;
        errorCountSpan.textContent = errorCount;
        validCountSpan.textContent = validCount;
    }

    // Uyarı mesajı
    function showMissingWarning(missingColumns) {
        if (missingColumns.length > 0) {
            missingWarning.style.display = 'block';
            missingWarning.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <strong>Uyarı:</strong> Zorunlu kolon(lar) bulunamadı: ${missingColumns.join(', ')}. CSV dosyanızda bu kolonların olduğundan emin olun.`;
        } else {
            missingWarning.style.display = 'none';
        }
    }

    // Ana işleme fonksiyonu
    function processFile(file) {
        if (!file) return;
        
        loading.style.display = 'block';
        previewSection.style.display = 'none';
        errorList.style.display = 'none';
        stepInfo.style.display = 'none';
        missingWarning.style.display = 'none';
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const { headers, data } = parseCSV(text);
                
                // Zorunlu kolon kontrolü
                const { hasAllRequired, missing, identIndex, monitoringIndex } = checkRequiredColumns(headers);
                
                if (!hasAllRequired) {
                    showMissingWarning(missing);
                    loading.style.display = 'none';
                    fileInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> Hata: Zorunlu kolonlar eksik - ${missing.join(', ')}`;
                    fileInfo.style.color = '#dc3545';
                    return;
                }
                
                currentHeaders = headers;
                identColumnIndex = identIndex;
                monitoringColumnIndex = monitoringIndex;
                
                const { validatedData, errors, identIndex: _, monitoringIndex: __ } = processData(headers, data);
                currentData = validatedData;
                
                const total = validatedData.length;
                const errorCount = errors.length;
                const validCount = total - errorCount;
                
                updateStats(total, errorCount, validCount);
                renderTable(validatedData, headers);
                renderErrorList(errors);
                renderIdentLinks(validatedData);
                
                previewSection.style.display = 'block';
                
                fileInfo.innerHTML = `<i class="fas fa-check-circle"></i> Yüklenen dosya: ${escapeHtml(file.name)} - ${total} kayıt, ${errorCount} hatalı Monitoring ID`;
                fileInfo.style.color = '#28a745';
                
                if (errorCount > 0) {
                    errorList.scrollIntoView({ behavior: 'smooth' });
                }
            } catch (err) {
                console.error(err);
                fileInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> Hata: ${err.message}`;
                fileInfo.style.color = '#dc3545';
                alert('Hata: ' + err.message);
            } finally {
                loading.style.display = 'none';
            }
        };
        
        reader.onerror = function() {
            alert('Dosya okunamadı!');
            loading.style.display = 'none';
        };
        
        reader.readAsText(file, 'UTF-8');
    }

    // Sıfırlama
    function resetAll() {
        currentData = [];
        currentHeaders = [];
        identColumnIndex = -1;
        monitoringColumnIndex = -1;
        fileInput.value = '';
        updateStats(0, 0, 0);
        previewSection.style.display = 'none';
        errorList.style.display = 'none';
        stepInfo.style.display = 'none';
        missingWarning.style.display = 'none';
        fileInfo.innerHTML = '';
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';
        errorItems.innerHTML = '';
        identList.innerHTML = '';
    }

    // Event Listeners
    function initEventListeners() {
        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('drag-over');
        });
        
        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('drag-over');
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().endsWith('.csv')) {
                processFile(file);
            } else {
                alert('Lütfen geçerli bir CSV dosyası yükleyin!');
            }
        });
        
        // Tıklama ile seçim
        uploadArea.addEventListener('click', (e) => {
            if (e.target === uploadArea || uploadArea.contains(e.target)) {
                if (e.target.classList && e.target.classList.contains('upload-btn')) return;
                fileInput.click();
            }
        });
        
        selectFileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            fileInput.click();
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                processFile(e.target.files[0]);
            }
        });
        
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetAll();
        });
        
        // Butonlara propagation engeli
        document.querySelectorAll('.upload-btn').forEach(btn => {
            btn.addEventListener('click', (e) => e.stopPropagation());
        });
    }
    
    // Başlat
    function init() {
        initEventListeners();
        console.log('Feedback Dağılım aracı hazır - Zorunlu kolonlar: "Ident" ve "Monitoring ID"');
    }
    
    init();
})();
