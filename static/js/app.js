let currentLang = 'zh';
let selectedFile = null;

// API Configuration - use env variable API_URL from Flask, fallback to same origin
const API_BASE_URL = (typeof window.API_URL !== 'undefined' && window.API_URL) ? window.API_URL : '';

// DOM Elements
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');
const cameraInput = document.getElementById('camera-input');
const btnUpload = document.getElementById('btn-upload');
const btnCamera = document.getElementById('btn-camera');
const btnIdentify = document.getElementById('btn-identify');
const previewContainer = document.getElementById('preview-container');
const previewImage = document.getElementById('preview-image');
const uploadSection = document.getElementById('upload-section');
const loadingSection = document.getElementById('loading-section');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');
const resultsSection = document.getElementById('results-section');
const resultsContent = document.getElementById('results-content');
const langToggle = document.getElementById('lang-toggle');
const btnRetry = document.getElementById('btn-retry');
const btnNew = document.getElementById('btn-new');

// Event Listeners
uploadZone.addEventListener('click', () => fileInput.click());
btnUpload.addEventListener('click', () => fileInput.click());
btnCamera.addEventListener('click', () => cameraInput.click());
btnIdentify.addEventListener('click', identifyBird);
btnRetry.addEventListener('click', resetToUpload);
btnNew.addEventListener('click', resetToUpload);
langToggle.addEventListener('click', toggleLanguage);

fileInput.addEventListener('change', handleFileSelect);
cameraInput.addEventListener('change', handleFileSelect);

uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '#F4A261';
});

uploadZone.addEventListener('dragleave', () => {
    uploadZone.style.borderColor = '';
});

uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.style.borderColor = '';
    if (e.dataTransfer.files.length > 0) {
        handleFile(e.dataTransfer.files[0]);
    }
});

function handleFileSelect(e) {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showError(currentLang === 'zh' ? '请选择图片文件' : 'Please select an image file');
        return;
    }

    selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewContainer.classList.remove('hidden');
        btnIdentify.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function showSection(section) {
    uploadSection.classList.add('hidden');
    loadingSection.classList.add('hidden');
    errorSection.classList.add('hidden');
    resultsSection.classList.add('hidden');
    section.classList.remove('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    showSection(errorSection);
}

async function identifyBird() {
    if (!selectedFile) {
        showError(currentLang === 'zh' ? '请先选择图片' : 'Please select an image first');
        return;
    }

    showSection(loadingSection);

    const formData = new FormData();
    formData.append('image', selectedFile);
    formData.append('lang', currentLang);

    try {
        const apiUrl = API_BASE_URL ? `${API_BASE_URL}/api/identify` : '/api/identify';
        const response = await fetch(apiUrl, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (data.success) {
            renderResults(data.result);
        } else {
            let errorMsg = data.error || (data.i18n && data.i18n.no_result) || '识别失败';

            // If setup is required, show more helpful message
            if (data.setup_required) {
                errorMsg = currentLang === 'zh'
                    ? '请设置 iNaturalist JWT 令牌后才能识别鸟类。请在命令行设置环境变量后重启应用。'
                    : 'Please set up your iNaturalist JWT token to identify birds. Set the environment variable and restart the app.';
            } else if (data.api_error) {
                errorMsg = currentLang === 'zh'
                    ? 'API 请求失败。请检查您的 API 密钥是否正确。'
                    : 'API request failed. Please check if your API key is correct.';
            }

            showError(errorMsg);
        }
    } catch (error) {
        showError(currentLang === 'zh' ? '网络错误，请重试' : 'Network error, please try again');
    }
}

function renderResults(result) {
    const i18n = result.i18n || {};
    const confidencePercent = Math.min(Math.round(result.confidence), 100);
    const confidenceLabel = confidencePercent >= 70 ? i18n.high_confidence : i18n.low_confidence;

    // Use i18n for display name (fallback to English if unknown)
    let displayName = result.display_name;
    if (displayName === 'Unknown' || !displayName) {
        displayName = i18n.unknown || 'Unknown Bird';
    }

    let photoHtml = '';
    if (result.photo_url) {
        photoHtml = `<img class="result-photo" src="${result.photo_url}" alt="${displayName}">`;
    }

    let wikiHtml = '';
    if (result.wikipedia_url) {
        wikiHtml = `<a class="wiki-link" href="${result.wikipedia_url}" target="_blank">${i18n.wikipedia} →</a>`;
    }

    // Build source comparison if available
    let sourcesHtml = '';
    if (result.sources && result.sources.length > 0) {
        const isAgreement = result.agreement;
        const agreeMsg = isAgreement ? i18n.sources_agree : i18n.sources_disagree;
        sourcesHtml = `
            <div class="sources-comparison">
                <div class="sources-header ${isAgreement ? 'agree' : 'disagree'}">
                    ${agreeMsg}
                </div>
                ${result.sources.map(s => `
                    <div class="source-row">
                        <span class="source-name">${s.source}</span>
                        <span class="source-name-en">${s.name}</span>
                        <span class="source-name-zh">${s.zh_name || ''}</span>
                        <span class="source-score">${Math.round(s.score)}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // Build taxonomy details
    let taxonomyHtml = '';
    const taxonomy = result.taxonomy || {};
    // Show full taxonomy hierarchy with i18n labels
    if (taxonomy.kingdom || taxonomy.family || taxonomy.order || taxonomy.rank) {
        taxonomyHtml = `
            <div class="taxonomy-details hidden" id="taxonomy-details">
                <h3>${i18n.taxonomy_info || '分类信息'}</h3>
                ${taxonomy.kingdom ? `<div class="detail-item"><span class="detail-label">${i18n.kingdom || 'Kingdom'}</span><span class="detail-value">${taxonomy.kingdom}</span></div>` : ''}
                ${taxonomy.phylum ? `<div class="detail-item"><span class="detail-label">${i18n.phylum || 'Phylum'}</span><span class="detail-value">${taxonomy.phylum}</span></div>` : ''}
                ${taxonomy.class ? `<div class="detail-item"><span class="detail-label">${i18n.class || 'Class'}</span><span class="detail-value">${taxonomy.class}</span></div>` : ''}
                ${taxonomy.order ? `<div class="detail-item"><span class="detail-label">${i18n.order || 'Order'}</span><span class="detail-value">${taxonomy.order}</span></div>` : ''}
                ${taxonomy.family ? `<div class="detail-item"><span class="detail-label">${i18n.family || 'Family'}</span><span class="detail-value">${taxonomy.family}</span></div>` : ''}
                ${taxonomy.subfamily ? `<div class="detail-item"><span class="detail-label">${i18n.subfamily || 'Subfamily'}</span><span class="detail-value">${taxonomy.subfamily}</span></div>` : ''}
                ${taxonomy.genus ? `<div class="detail-item"><span class="detail-label">${i18n.genus || 'Genus'}</span><span class="detail-value">${taxonomy.genus}</span></div>` : ''}
                ${taxonomy.species_count ? `<div class="detail-item"><span class="detail-label">${i18n.species_in_group || 'Species in Group'}</span><span class="detail-value">${taxonomy.species_count}</span></div>` : ''}
                <div class="detail-item">
                    <span class="detail-label">${i18n.more_info || 'More Info'}</span>
                    <span class="detail-value"><a href="https://www.inaturalist.org/taxa/${taxonomy.taxon_id}" target="_blank" style="color: #F4A261;">${i18n.view_on_inaturalist || 'View on iNaturalist →'}</a></span>
                </div>
            </div>
        `;
    }

    // Range map button
    let rangeMapHtml = '';
    if (result.rangemap_url) {
        rangeMapHtml = `<a class="btn-range" href="${result.rangemap_url}" target="_blank">${i18n.range_map} 🗺️</a>`;
    }

    // Scientific details toggle button
    const detailsBtnHtml = (taxonomy.kingdom || taxonomy.family || taxonomy.order || taxonomy.rank) ?
        `<button class="btn-details-toggle" onclick="toggleTaxonomy()">${i18n.show_details} 📋</button>` : '';

    resultsContent.innerHTML = `
        <div class="result-main">
            ${photoHtml}
            <div class="result-name">${displayName}</div>
            <div class="result-scientific">${result.scientific_name || ''}</div>
            <div class="confidence-bar">
                <div class="confidence-fill" style="width: ${confidencePercent}%"></div>
            </div>
            <div class="confidence-text">${i18n.confidence}: ${confidencePercent}% (${confidenceLabel})</div>
        </div>
        ${sourcesHtml}
        <div class="result-details">
            ${result.scientific_name ? `
            <div class="detail-item">
                <span class="detail-label">${i18n.scientific_name}</span>
                <span class="detail-value">${result.scientific_name}</span>
            </div>
            ` : ''}
            <div class="detail-item">
                <span class="detail-label">${i18n.source}</span>
                <span class="detail-value">${result.sources ? result.sources.map(s => s.source).join(' + ') : 'iNaturalist'}</span>
            </div>
        </div>
        ${detailsBtnHtml}
        ${taxonomyHtml}
        ${rangeMapHtml}
        ${wikiHtml}
    `;

    showSection(resultsSection);
}

function resetToUpload() {
    selectedFile = null;
    fileInput.value = '';
    cameraInput.value = '';
    previewContainer.classList.add('hidden');
    btnIdentify.classList.add('hidden');
    showSection(uploadSection);
}

// Helper function to update language toggle button text
function updateLanguageButton() {
    // Toggle button shows the OPPOSITE language - what you can switch TO
    if (currentLang === 'zh') {
        langToggle.textContent = 'English';
    } else {
        langToggle.textContent = '中文';
    }
}

// Load saved language preference on startup
const savedLang = localStorage.getItem('birdid-lang');
if (savedLang) {
    currentLang = savedLang;
    document.documentElement.lang = currentLang;
}

// Set initial button text on page load
updateLanguageButton();

// Fetch initial i18n and update all UI
fetch(`/i18n/${currentLang}`)
    .then(response => response.json())
    .then(i18n => {
        window.currentI18n = i18n;
        updateAllUI();
    })
    .catch(e => console.error('Failed to load initial i18n:', e));

// Function to update all UI elements with current language
function updateAllUI() {
    if (!window.currentI18n) return;

    // Update main page elements
    document.querySelector('header h1').textContent = '🐦 ' + window.currentI18n.app_title;
    document.querySelector('.upload-section h2').textContent = window.currentI18n.upload_title;
    document.querySelector('#upload-zone p').textContent = window.currentI18n.upload_hint;
    document.querySelector('#btn-upload').textContent = window.currentI18n.btn_upload;
    document.querySelector('#btn-camera').textContent = window.currentI18n.btn_camera;

    // Update identify button if visible
    const btnIdentifyEl = document.getElementById('btn-identify');
    if (btnIdentifyEl && !btnIdentifyEl.classList.contains('hidden')) {
        btnIdentifyEl.textContent = window.currentI18n.btn_identify;
    }

    // Update retry buttons (these exist but are in hidden sections)
    const btnRetryEl = document.getElementById('btn-retry');
    const btnNewEl = document.getElementById('btn-new');
    if (btnRetryEl) btnRetryEl.textContent = window.currentI18n.btn_try_again;
    if (btnNewEl) btnNewEl.textContent = window.currentI18n.btn_try_again;
}

async function toggleLanguage() {
    // Toggle language
    if (currentLang === 'zh') {
        currentLang = 'en';
    } else {
        currentLang = 'zh';
    }

    document.documentElement.lang = currentLang;
    localStorage.setItem('birdid-lang', currentLang);

    // Update toggle button
    updateLanguageButton();

    // Fetch and apply new i18n
    try {
        const response = await fetch(`/i18n/${currentLang}`);
        window.currentI18n = await response.json();

        // Update all UI text
        updateAllUI();

        // Update taxonomy toggle button text if visible
        const detailsBtn = document.querySelector('.btn-details-toggle');
        if (detailsBtn && window.currentI18n) {
            const isHidden = document.getElementById('taxonomy-details')?.classList.contains('hidden');
            detailsBtn.textContent = isHidden ? window.currentI18n.show_details + ' 📋' : window.currentI18n.hide_details + ' 📋';
        }
    } catch (e) {
        console.error('Failed to load i18n:', e);
    }
}

// Global function to toggle taxonomy details
window.toggleTaxonomy = function() {
    const taxonomyDiv = document.getElementById('taxonomy-details');
    const detailsBtn = document.querySelector('.btn-details-toggle');
    if (taxonomyDiv && detailsBtn && window.currentI18n) {
        if (taxonomyDiv.classList.contains('hidden')) {
            taxonomyDiv.classList.remove('hidden');
            detailsBtn.textContent = window.currentI18n.hide_details + ' 📋';
        } else {
            taxonomyDiv.classList.add('hidden');
            detailsBtn.textContent = window.currentI18n.show_details + ' 📋';
        }
    }
};