// Feedback Dağılım - Ana Kontrol Modülü
// Zorunlu kolonlar: "Ident" ve "Monitoring ID"

(function() {
    // DOM Elements
    const selectFileBtn = document.getElementById('selectFileBtn');
    const resetBtn = document.getElementById('resetBtn');
    const fileInput = document.getElementById('fileInput');
    const uploadArea = document.getElementById('uploadArea');
    const fileInfo = document.getElementById('fileInfo');
    const loadingRow = document.getElementById('loadingRow');
    const step1Row = document.getElementById('step1Row');
    const tableHeaderRow = document.getElementById('tableHeaderRow');
    const tableRow = document.getElementById('tableRow');
    const errorListRow = document.getElementById('errorListRow');
    const totalCountSpan = document.getElementById('totalCount');
    const errorCountSpan = document.getElementById('errorCount');
    const validCountSpan = document.getElementById('validCount');
    const tableHeader = document.getElementById('tableHeader');
    const tableBody = document.getElementById('tableBody');
    const errorList = document.getElementById('errorList');
    const identButtons = document.getElementById('identButtons');

    // Monitoring ID Validation - 8 haneli numerik
    function validateMonitoringId(value) {
        if (value === null || value === undefined || value === '') {
            return { valid: false, reason: 'Boş değer' };
        }
        const strValue = String(value).trim();
        if (strValue === '') return { valid: false, reason: 'Boşluk içeriyor' };
        if (!/^\d+$/.test(strValue)) return { valid: false, reason: 'Numerik değer içermiyor (sadece rakam olmalı)' };
        if (strValue.length !== 8) return { valid: false, reason: `${strValue.length} haneli (8 haneli olmalı)` };
        return { valid: true, reason: '' };
    }

    // Dinamik link oluşturma
    function generateLink(ident) {
        if (!ident || ident.trim() === '') return '#';
        const baseUrl = 'https://sebra.ccms.teleperformance.com/ccms-bin/console/tops/checklist.pl';
        return `${baseUrl}?frmTarget=CHECKLIST&checklist_ident=${encodeURIComponent(ident.trim())}&frmOption=OPTION`;
    }

    // CSV satırı ayrıştırma
    function parseCSVLine(line) {
        const result = [];
        let inQuotes = false;
        let current = '';
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else current += char;
        }
        result.push(current.trim());
        return result.map(f => (f.startsWith('"') && f.endsWith('"')) ? f.slice(1, -1) : f);
    }

    // CSV ayrıştırma
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

    // Zorunlu kolon kontrolü
    function checkRequiredColumns(headers) {
        const identIndex = headers.findIndex(h => h === 'Ident');
        const monitoringIndex = headers.findIndex(h => h === 'Monitoring ID');
        const missing = [];
        if (identIndex === -1) missing.push('Ident');
        if (monitoringIndex === -1) missing.push('Monitoring ID');
        return { hasAllRequired: missing.length === 0, missing, identIndex, monitoringIndex };
    }

    // Veri işleme
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
                errors.push({ row: i + 1, monitoringId: monitoringValue, reason: validation.reason, ident: identValue });
            }
        }
        return { validatedData, errors };
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // Tablo render
    function renderTable(validatedData, headers) {
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';
        if (!headers || headers.length === 0) return;
        
        const headerRow = document.createElement('tr');
        headers.forEach(header => {
            const th = document.createElement('th');
            th.textContent = header;
            if (header === 'Monitoring ID') th.style.backgroundColor = '#fd4239';
            if (header === 'Ident') th.style.backgroundColor = '#28a745';
            headerRow.appendChild(th);
        });
        const statusTh = document.createElement('th');
        statusTh.textContent = 'Monitoring ID Durumu';
        statusTh.style.backgroundColor = '#009dd0';
        headerRow.appendChild(statusTh);
        tableHeader.appendChild(headerRow);
        
        validatedData.forEach(item => {
            const row = document.createElement('tr');
            if (!item.valid) row.classList.add('error-row');
            
            headers.forEach((header, idx) => {
                const td = document.createElement('td');
                let cellValue = idx < item.originalRow.length ? item.originalRow[idx] : '';
                if (header === 'Monitoring ID' && !item.valid) {
                    td.innerHTML = `<span class="error-badge">✗ ${escapeHtml(cellValue) || '(boş)'}</span>`;
                } else if (header === 'Ident' && cellValue) {
                    const link = generateLink(cellValue);
                    td.innerHTML = `<a href="${link}" target="_blank" style="color:#009dd0;">🔗 ${escapeHtml(cellValue)}</a>`;
                } else {
                    td.textContent = cellValue;
                }
                row.appendChild(td);
            });
            
            const statusTd = document.createElement('td');
            statusTd.innerHTML = item.valid ? '<span class="valid-badge">✓ Geçerli (8 hane)</span>' : `<span class="error-badge">✗ Hata: ${item.errorReason}</span>`;
            row.appendChild(statusTd);
            tableBody.appendChild(row);
        });
    }

    // Hata listesi
    function renderErrorList(errors) {
        errorList.innerHTML = '';
        if (errors.length === 0) {
            errorListRow.style.display = 'none';
            return;
        }
        errors.forEach(err => {
            const li = document.createElement('li');
            let identLink = '';
            if (err.ident && err.ident.trim()) {
                identLink = `<a href="${generateLink(err.ident)}" target="_blank"><i class="fas fa-link"></i> Ident: ${escapeHtml(err.ident)}</a>`;
            }
            li.innerHTML = `<i class="fas fa-bug" style="color:#fd4239"></i> <strong>Satır ${err.row}</strong> | Monitoring ID: "${escapeHtml(err.monitoringId)}" | <span style="color:#fd4239">${err.reason}</span> ${identLink}`;
            errorList.appendChild(li);
        });
        errorListRow.style.display = 'table-row';
    }

    // Ident linkleri (Step 1)
    function renderIdentLinks(validatedData) {
        identButtons.innerHTML = '';
        const uniqueIdents = [...new Set(validatedData.map(item => item.ident).filter(id => id && id.trim()))];
        if (uniqueIdents.length === 0) {
            step1Row.style.display = 'none';
            return;
        }
        uniqueIdents.forEach(ident => {
            const link = generateLink(ident);
            const btn = document.createElement('a');
            btn.href = link;
            btn.target = '_blank';
            btn.className = 'ident-link';
            btn.innerHTML = `<i class="fas fa-link"></i> ${escapeHtml(ident)}`;
            identButtons.appendChild(btn);
        });
        step1Row.style.display = 'table-row';
    }

    function updateStats(total, errorCount, validCount) {
        totalCountSpan.textContent = total;
        errorCountSpan.textContent = errorCount;
        validCountSpan.textContent = validCount;
    }

    function showHideRows(show) {
        const display = show ? 'table-row' : 'none';
        tableHeaderRow.style.display = display;
        tableRow.style.display = display;
        if (!show) errorListRow.style.display = 'none';
        if (!show) step1Row.style.display = 'none';
    }

    // Ana işlem
    function processFile(file) {
        if (!file) return;
        
        loadingRow.style.display = 'table-row';
        showHideRows(false);
        fileInfo.innerHTML = '';
        
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const text = e.target.result;
                const { headers, data } = parseCSV(text);
                
                const { hasAllRequired, missing } = checkRequiredColumns(headers);
                if (!hasAllRequired) {
                    fileInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> Hata: Zorunlu kolonlar eksik - ${missing.join(', ')}`;
                    fileInfo.style.color = '#fd4239';
                    loadingRow.style.display = 'none';
                    return;
                }
                
                const { validatedData, errors } = processData(headers, data);
                const total = validatedData.length;
                const errorCount = errors.length;
                const validCount = total - errorCount;
                
                updateStats(total, errorCount, validCount);
                renderTable(validatedData, headers);
                renderErrorList(errors);
                renderIdentLinks(validatedData);
                showHideRows(true);
                
                fileInfo.innerHTML = `<i class="fas fa-check-circle"></i> ${escapeHtml(file.name)} - ${total} kayıt, ${errorCount} hata`;
                fileInfo.style.color = '#28a745';
                
                if (errorCount > 0) errorListRow.scrollIntoView({ behavior: 'smooth' });
            } catch (err) {
                fileInfo.innerHTML = `<i class="fas fa-exclamation-circle"></i> Hata: ${err.message}`;
                fileInfo.style.color = '#fd4239';
            } finally {
                loadingRow.style.display = 'none';
            }
        };
        reader.onerror = () => { alert('Dosya okunamadı!'); loadingRow.style.display = 'none'; };
        reader.readAsText(file, 'UTF-8');
    }

    function resetAll() {
        fileInput.value = '';
        updateStats(0, 0, 0);
        showHideRows(false);
        fileInfo.innerHTML = '';
        tableHeader.innerHTML = '';
        tableBody.innerHTML = '';
        errorList.innerHTML = '';
        identButtons.innerHTML = '';
    }

    // Event Listeners
    function init() {
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('drag-over'); });
        uploadArea.addEventListener('dragleave', () => { uploadArea.classList.remove('drag-over'); });
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.name.toLowerCase().endsWith('.csv')) processFile(file);
            else alert('Lütfen geçerli bir CSV dosyası yükleyin!');
        });
        
        uploadArea.addEventListener('click', (e) => {
            if (e.target === uploadArea || uploadArea.contains(e.target)) {
                if (e.target.classList && e.target.classList.contains('btn')) return;
                fileInput.click();
            }
        });
        
        selectFileBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
        fileInput.addEventListener('change', (e) => { if (e.target.files.length > 0) processFile(e.target.files[0]); });
        resetBtn.addEventListener('click', (e) => { e.stopPropagation(); resetAll(); });
        
        document.querySelectorAll('.btn').forEach(btn => btn.addEventListener('click', (e) => e.stopPropagation()));
        
        console.log('Feedback Dağılım aracı hazır - Zorunlu kolonlar: "Ident" ve "Monitoring ID"');
    }
    
    init();
})();
