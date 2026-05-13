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

        console.log('Response status:', response.status);
        console.log('Response headers:', response.headers.get('content-type'));

        const data = await response.json();
        console.log('Response data:', data);

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
        console.error('API Error:', error);
        showError(currentLang === 'zh' ? '网络错误，请重试' : 'Network error, please try again');
    }
}

function renderResults(result) {
    const i18n = result.i18n || {};
    const confidencePercent = result.confidence ? Math.min(Math.round(result.confidence), 100) : 0;
    const confidenceLabel = confidencePercent >= 70 ? i18n.high_confidence : i18n.low_confidence;

    let displayName;
    if (currentLang === 'zh') {
        displayName = result.display_name || result.en_name || '';
    } else {
        displayName = result.en_name || result.display_name || '';
        if (currentLang === 'en') {
            displayName = displayName.replace(/[\u4e00-\u9fff]/g, '').trim();
        }
    }
    
    // Use AI name if in English mode (prefer iNaturalist name otherwise)
    if (currentLang === 'en' && result.ai_info && result.ai_info.name) {
        const aiName = result.ai_info.name;
        if (/[a-zA-Z]/.test(aiName)) {
            displayName = aiName.replace(/[\u4e00-\u9fff]/g, '').trim();
        }
    }
    if (displayName === 'Unknown' || !displayName) {
        displayName = i18n.unknown || 'Unknown Bird';
    }

    // Build photo gallery (uploaded photo + iNaturalist photos) - swipeable like messaging
    let photoHtml = '';
    const photos = [];
    console.log('photo_url:', result.photo_url);
    console.log('additional_photos:', result.additional_photos);
    
    if (result.photo_url) {
        photos.push(result.photo_url);
    }
    if (result.additional_photos && Array.isArray(result.additional_photos)) {
        result.additional_photos.forEach(p => {
            if (p && !photos.includes(p)) photos.push(p);
        });
    }
    
    console.log('Total photos:', photos.length);
    
    if (photos.length > 0) {
        const photoCount = photos.length;
        photoHtml = `
            <div class="photo-gallery-section">
                <div class="photo-gallery-title">${i18n.photo_gallery || '照片集'} (${photoCount})</div>
                <div class="photo-carousel" id="photo-carousel">
                    ${photos.map((url, idx) => 
                        `<div class="photo-slide ${idx === 0 ? 'active' : ''}" data-index="${idx}">
                            <img src="${url}" alt="${displayName}">
                        </div>`
                    ).join('')}
                </div>
                ${photoCount > 1 ? `
                <div class="photo-nav">
                    <button class="photo-nav-btn prev" onclick="changePhoto(-1)">‹</button>
                    <div class="photo-dots">
                        ${photos.map((_, idx) => 
                            `<span class="photo-dot ${idx === 0 ? 'active' : ''}" onclick="goToPhoto(${idx})"></span>`
                        ).join('')}
                    </div>
                    <button class="photo-nav-btn next" onclick="changePhoto(1)">›</button>
                </div>
                ` : ''}
            </div>
        `;
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
        // Show only English names in source list
        sourcesHtml = `
            <div class="sources-comparison">
                <div class="sources-header ${isAgreement ? 'agree' : 'disagree'}">
                    ${agreeMsg}
                </div>
                ${result.sources.map(s => `
                    <div class="source-row">
                        <span class="source-name">${s.source}</span>
                        <span class="source-name-en">${currentLang === 'zh' && s.zh_name ? s.zh_name : s.name}</span>
                        <span class="source-score">${Math.round(s.score)}%</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

// Build taxonomy details
    const taxonomy = result.taxonomy || {};
    
    // Full taxonomy (shown by default)
    let taxonomyHtml = '';
    if (taxonomy.kingdom || taxonomy.family || taxonomy.order || taxonomy.rank) {
        taxonomyHtml = `
            <div class="taxonomy-details" id="taxonomy-details">
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

    // Range map button (old - now using embedded map)
    let rangeMapHtml = '';

    // AI Overview section
    let aiOverviewHtml = '';
    if (result.ai_info) {
        if (result.ai_info.error === 'rate_limited') {
            aiOverviewHtml = `
                <div class="ai-section">
                    <h3>${i18n.ai_overview || 'AI 详细介绍'}</h3>
                    <p class="ai-unavailable">${i18n.ai_overview_unavailable || 'AI 详细介绍暂时不可用（API 达到上限）'}</p>
                </div>
            `;
        } else {
            const ai = result.ai_info;
            aiOverviewHtml = `
                <div class="ai-section">
                    <h3>${i18n.ai_overview || 'AI 详细介绍'}</h3>
                    ${ai.name ? `<p class="ai-name"><strong>${i18n.common_name || '通用名'}:</strong> ${ai.name}</p>` : ''}
                    ${ai.nickname ? `<p class="ai-nickname"><strong>${i18n.nickname || '昵称'}:</strong> ${ai.nickname}</p>` : ''}
                    ${ai.habitat ? `<p class="ai-habitat"><strong>${i18n.habitat || '栖息地'}:</strong> ${ai.habitat}</p>` : ''}
                    ${ai.diet ? `<p class="ai-diet"><strong>${i18n.diet || '饮食'}:</strong> ${ai.diet}</p>` : ''}
                    ${ai.fun_facts && ai.fun_facts.length > 0 ? `
                        <div class="ai-facts">
                            <strong>${i18n.fun_facts || '有趣的事实'}:</strong>
                            <ul>
                                ${ai.fun_facts.map(fact => `<li>${fact}</li>`).join('')}
                            </ul>
                        </div>
                    ` : ''}
                    ${ai.model ? `<p class="ai-model-ref"><small>${i18n.ai_model || 'Model'}: ${ai.model}</small></p>` : ''}
                </div>
            `;
        }
    }

    // Map section - embedded Leaflet map
    let mapHtml = '';
    const rank = result.taxonomy?.rank || '';
    const taxonId = result.taxonomy?.taxon_id || result.taxon_id;
    console.log('Map debug:', { rank, taxonId, rangemap_url: result.rangemap_url });
    if (taxonId) {
        mapHtml = `
            <div class="map-section">
                <h3 class="map-title">${i18n.distribution_map || '分布地图'}</h3>
                <div class="map-container" id="map-container">
                    <div class="map-loading">${i18n.loading_map || '加载地图中...'}</div>
                    <div id="distribution-map"></div>
                </div>
            </div>
        `;
    }

    // Scientific details toggle button (remove since now shown by default)
    const detailsBtnHtml = '';

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
        ${aiOverviewHtml}
        ${mapHtml}
        ${wikiHtml}
    `;

    showSection(resultsSection);
    
    // Initialize map if taxon ID exists
    if (taxonId) {
        initDistributionMap(taxonId);
    }
}

// Store map instance globally
let distributionMap = null;

// Map initialization function
function initDistributionMap(taxonId) {
    const mapContainer = document.getElementById('map-container');
    const mapDiv = document.getElementById('distribution-map');
    if (!mapDiv || !mapContainer || !taxonId) return;
    
    // Get i18n from window
    const mapI18n = window.currentI18n || {};
    
    // Destroy existing map if any
    if (distributionMap) {
        distributionMap.remove();
        distributionMap = null;
    }
    
    // Remove loading, add fullscreen button
    mapDiv.innerHTML = '';
    const fsBtn = document.createElement('button');
    fsBtn.className = 'map-fullscreen-btn';
    fsBtn.textContent = mapI18n.fullscreen || '全屏';
    fsBtn.onclick = () => toggleMapFullscreen(mapContainer);
    mapContainer.appendChild(fsBtn);
    
    // Initialize map centered on world
    distributionMap = L.map('distribution-map', {
        zoomControl: true,
        attributionControl: false
    }).setView([20, 0], 2);
    
    // Add tile layer (OpenStreetMap)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18
    }).addTo(distributionMap);
    
    // Try fetching observation points (works for all taxon ranks)
    const obsUrl = `https://api.inaturalist.org/v1/observations?taxon_id=${taxonId}&per_page=200&order_by=observed_on&order=desc`;
    
    fetch(obsUrl)
        .then(response => response.json())
        .then(data => {
            const results = data.results || [];
            if (results.length === 0) {
                showMapNoData(mapContainer);
                return;
            }
            
            const points = [];
            results.forEach(obs => {
                const lat = obs.geojson?.coordinates?.[1];
                const lng = obs.geojson?.coordinates?.[0] || obs.location;
                if (lat && lng) {
                    points.push([lat, parseFloat(lng)]);
                }
            });
            
            if (points.length === 0) {
                showMapNoData(mapContainer);
                return;
            }
            
            // Add points to map
            L.circleMarker(points[0], {
                radius: 3,
                fillColor: '#F4A261',
                color: '#F4A261',
                weight: 1,
                fillOpacity: 0.6
            }).addTo(distributionMap);
            
            // Add remaining points with heat-like density
            const markerGroup = L.layerGroup();
            points.forEach(point => {
                L.circleMarker(point, {
                    radius: 2,
                    fillColor: '#E76F51',
                    color: '#E76F51',
                    weight: 1,
                    fillOpacity: 0.5
                }).addTo(markerGroup);
            });
            markerGroup.addTo(distributionMap);
            
            distributionMap.fitBounds(L.latLngBounds(points), { padding: [20, 20] });
            
            // Add info text
            const info = L.control({position: 'bottomleft'});
            info.onAdd = () => {
                const div = L.DomUtil.create('div', 'map-obs-count');
                div.innerHTML = `${results.length} ${mapI18n.observations || 'observations'}`;
                return div;
            };
            info.addTo(distributionMap);
        })
        .catch(err => {
            console.log('Map data not available:', err);
            showMapNoData(mapContainer);
        });
}

function showMapNoData(container, isGroupLevel = false) {
    const mapDiv = document.getElementById('distribution-map');
    const mapI18n = window.currentI18n || {};
    if (mapDiv) {
        const message = isGroupLevel 
            ? (mapI18n.map_group_level || 'Distribution map only available for species-level identifications')
            : (mapI18n.no_distribution_data || '暂无分布数据');
        mapDiv.innerHTML = `<div class="map-no-data">${message}</div>`;
    }
}

function toggleMapFullscreen(container) {
    container.classList.toggle('fullscreen');
    const btn = container.querySelector('.map-fullscreen-btn');
    const mapI18n = window.currentI18n || {};
    if (btn) {
        btn.textContent = container.classList.contains('fullscreen') 
            ? (mapI18n.exit_fullscreen || '退出全屏') 
            : (mapI18n.fullscreen || '全屏');
    }
    // Invalidate map size when toggling
    setTimeout(() => {
        if (distributionMap) {
            distributionMap.invalidateSize();
        }
    }, 100);
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

// Load saved language preference on startup (default to Chinese)
const savedLang = localStorage.getItem('birdid-lang');
if (savedLang && (savedLang === 'zh' || savedLang === 'en')) {
    currentLang = savedLang;
} else {
    currentLang = 'zh';  // Default to Chinese
}
document.documentElement.lang = currentLang;

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

// Photo carousel functions
let currentPhotoIndex = 0;
let totalPhotos = 0;

function changePhoto(direction) {
    const slides = document.querySelectorAll('.photo-slide');
    if (slides.length === 0) return;
    
    totalPhotos = slides.length;
    currentPhotoIndex = (currentPhotoIndex + direction + totalPhotos) % totalPhotos;
    updateCarousel();
}

function goToPhoto(index) {
    currentPhotoIndex = index;
    updateCarousel();
}

function updateCarousel() {
    const slides = document.querySelectorAll('.photo-slide');
    const dots = document.querySelectorAll('.photo-dot');
    
    slides.forEach((slide, idx) => {
        slide.classList.toggle('active', idx === currentPhotoIndex);
    });
    dots.forEach((dot, idx) => {
        dot.classList.toggle('active', idx === currentPhotoIndex);
    });
}

// Touch swipe support
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', e => {
    if (e.target.closest('.photo-carousel')) {
        touchStartX = e.changedTouches[0].screenX;
    }
});

document.addEventListener('touchend', e => {
    if (e.target.closest('.photo-carousel')) {
        touchEndX = e.changedTouches[0].screenX;
        if (touchStartX - touchEndX > 50) changePhoto(1);
        if (touchEndX - touchStartX > 50) changePhoto(-1);
    }
});