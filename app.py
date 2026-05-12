import os
import json
import base64
import requests
from flask import Flask, render_template, request, jsonify, send_from_directory
from PIL import Image
from io import BytesIO

# Load .env file for local development
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # python-dotenv not installed

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

with open(os.path.join(BASE_DIR, 'species_names.json'), 'r', encoding='utf-8') as f:
    SPECIES_NAMES = json.load(f)

with open(os.path.join(BASE_DIR, 'i18n', 'zh.json'), 'r', encoding='utf-8') as f:
    I18N_ZH = json.load(f)

with open(os.path.join(BASE_DIR, 'i18n', 'en.json'), 'r', encoding='utf-8') as f:
    I18N_EN = json.load(f)


def translate_species(name):
    if not name or name == 'Unknown':
        return name

    # Direct match
    if name in SPECIES_NAMES:
        return SPECIES_NAMES[name]

    # Partial match - check if any key is contained in the name
    for eng_name, zh_name in SPECIES_NAMES.items():
        if eng_name.lower() in name.lower() or name.lower() in eng_name.lower():
            return zh_name

    return name


# Known taxonomy updates where iNaturalist uses old names but modern taxonomy changed
TAXONOMY_OVERRIDES = {
    # Finches & Goldfinches
    'Spinus': 'Chloris',  # Goldfinches, siskins - Spinus to Chloris
    'Carduelis': 'Carduelis',  # Old world finches (some still in Carduelis)
    'Serinus': 'Serinus',  # Canaries, serins
    
    # Cardinals & Buntings
    'Cardinalis': 'Cardinalis',  # Cardinals (correct)
    'Pheucticus': 'Pheucticus',  # Grosbeaks (correct)
    'Passerina': 'Passerina',  # Buntings (correct)
    'Spiza': 'Spiza',  # Dickcissel (correct)
    
    # Jays & Crows
    'Cyanocitta': 'Cyanocitta',  # Blue jays (correct)
    'Cyanocorax': 'Cyanocorax',  # New world jays (correct)
    'Corvus': 'Corvus',  # Crows, ravens (correct)
    
    # Blackbirds & Orioles
    'Icterus': 'Icterus',  # Orioles (correct)
    'Agelaius': 'Agelaius',  # Blackbirds (correct)
    'Molothrus': 'Molothrus',  # Cowbirds (correct)
    'Quiscalus': 'Quiscalus',  # Grackles (correct)
    'Sturnella': 'Sturnella',  # Meadowlarks (correct)
    
    # Starlings & Mynas
    'Sturnus': 'Sturnus',  # Starlings (correct)
    'Acridotheres': 'Acridotheres',  # Mynas (correct)
    
    # Sparrows & Juncos
    'Junco': 'Junco',  # Juncos (correct)
    'Spizella': 'Spizella',  # Sparrows (correct)
    'Melozone': 'Melozone',  # Towhees (correct)
    'Pipilo': 'Pipilo',  # Towhees (correct)
    
    # Thrushes
    'Turdus': 'Turdus',  # Thrushes (correct)
    'Catharus': 'Catharus',  # Catharus thrushes (correct)
    
    # Wrens
    'Troglodytes': 'Troglodytes',  # Wrens (correct)
    'Thryomanes': 'Thryomanes',  # Bewick's wren (correct)
    
    # Kingfishers
    'Megaceryle': 'Megaceryle',  # Large kingfishers (correct)
    'Chloroceryle': 'Chloroceryle',  # Green kingfishers (correct)
    
    # Herons & Egrets
    'Ardea': 'Ardea',  # Large herons (correct)
    'Egretta': 'Egretta',  # Egrets (correct)
    'Bubulcus': 'Bubulcus',  # Cattle egret (correct)
    'Nycticorax': 'Nycticorax',  # Night herons (correct)
    
    # Hawks & Eagles
    'Buteo': 'Buteo',  # Buteo hawks (correct)
    'Accipiter': 'Accipiter',  # Accipiter hawks (correct)
    'Haliaeetus': 'Haliaeetus',  # Sea eagles (correct)
    
    # Owls
    'Bubo': 'Bubo',  # Large owls (correct)
    'Strix': 'Strix',  # Earless owls (correct)
    'Megascops': 'Megascops',  # Screech owls (correct)
    
    # Woodpeckers
    'Dryocopus': 'Dryocopus',  # Woodpeckers (correct)
    'Melanerpes': 'Melanerpes',  # Woodpeckers (correct)
    'Picus': 'Picus',  # Green woodpeckers (correct)
    
    # Hummingbirds
    'Archilochus': 'Archilochus',  # Hummingbirds (correct)
    'Selasphorus': 'Selasphorus',  # Hummingbirds (correct)
    'Amazilia': 'Amazilia',  # Hummingbirds (correct)
}


def fix_taxonomy_genus(scientific_name):
    """Fix known taxonomy issues where iNaturalist uses old genus names"""
    if not scientific_name:
        return scientific_name
    
    # Extract genus (first part of scientific name)
    genus = scientific_name.split()[0] if ' ' in scientific_name else scientific_name
    
    if genus in TAXONOMY_OVERRIDES:
        new_genus = TAXONOMY_OVERRIDES[genus]
        if new_genus != genus:
            return scientific_name.replace(genus, new_genus, 1)
    
    return scientific_name


def get_wikipedia_url(wiki_url, lang):
    """Keep Wikipedia URL in English since Chinese pages often don't exist"""
    # Most bird species don't have Chinese Wikipedia pages
    # Keep English Wikipedia to avoid broken links
    if not wiki_url:
        return wiki_url
    
    return wiki_url


def get_taxon_photos(taxon_id, token):
    """Get multiple photos from iNaturalist taxon API"""
    if not taxon_id or not token:
        return []
    
    photos = []
    try:
        url = f'https://api.inaturalist.org/v2/taxa/{taxon_id}'
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])
            if results and len(results) > 0:
                taxon_data = results[0]
                
                # Get taxon_photos array
                taxon_photos = taxon_data.get('taxon_photos', [])
                for tp in taxon_photos[:4]:  # Get up to 4 more photos
                    photo = tp.get('photo', {})
                    if photo:
                        # Get medium size URL
                        photo_url = photo.get('medium_url') or photo.get('url', '')
                        if photo_url:
                            photos.append(photo_url)
                
                # Also get default photo if not already included
                default_photo = taxon_data.get('default_photo', {})
                if default_photo:
                    default_url = default_photo.get('medium_url') or default_photo.get('url', '')
                    if default_url and default_url not in photos:
                        photos.insert(0, default_url)
        
        return photos[:4]  # Return up to 4 photos from API
    except Exception as e:
        print(f"  Error getting taxon photos: {e}")
        return []


def get_gemini_info(species_name, lang):
    """Get Chinese name and overview from Google Gemini AI"""
    import time
    
    gemini_key = os.environ.get('GEMINI_API_KEY', '')
    if not gemini_key:
        return None
    
    try:
        # Build prompt based on language
        if lang == 'zh':
            prompt = f"""请提供关于鸟类"{species_name}"的详细信息。返回一个JSON对象，包含以下字段：
- chinese_name: 中文通用名
- habitat: 栖息地描述
- diet: 饮食习性  
- fun_facts: 3个有趣的事实（数组）

请用中文回答，只返回JSON，不要其他文字。"""
        else:
            prompt = f"""Provide information about the bird species "{species_name}". Return a JSON object with:
- chinese_name: Chinese common name
- habitat: habitat description
- diet: diet information
- fun_facts: 3 interesting facts (array)

Return ONLY JSON, no other text."""
        
        url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={gemini_key}'
        
        payload = {
            'contents': [{
                'parts': [{'text': prompt}]
            }],
            'generationConfig': {
                'temperature': 0.7,
                'maxOutputTokens': 1000
            }
        }
        
        headers = {'Content-Type': 'application/json'}
        
        response = requests.post(url, json=payload, headers=headers, timeout=15)
        
        if response.status_code == 429:
            print("  Gemini API rate limited")
            return {'error': 'rate_limited'}
        
        if response.status_code != 200:
            print(f"  Gemini API error: {response.status_code}")
            return None
        
        data = response.json()
        
        # Extract the response text
        if 'candidates' in data and len(data['candidates']) > 0:
            content = data['candidates'][0].get('content', {})
            parts = content.get('parts', [])
            if parts:
                text = parts[0].get('text', '')
                
                # Try to parse as JSON
                import re
                json_match = re.search(r'\{.*\}', text, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group())
                    return result
        
        return None
        
    except Exception as e:
        print(f"  Gemini API exception: {e}")
        return None


def extract_taxonomy(common_ancestor):
    """Extract taxonomy from common_ancestor data"""
    if not common_ancestor:
        return {}

    # Get ancestor IDs from the common_ancestor
    ancestor_ids = common_ancestor.get('ancestor_ids', [])

    # Since we don't have ancestor names in the response, we'll make a separate call
    # But for now, extract what we can
    taxonomy = {
        'kingdom': '',
        'phylum': '',
        'class': '',
        'order': '',
        'family': '',
        'genus': '',
        'rank': common_ancestor.get('rank', ''),
        'iconic_taxon': common_ancestor.get('iconic_taxon_name', ''),
        'observations_count': common_ancestor.get('observations_count', 0),
        'complete_species_count': common_ancestor.get('complete_species_count', 0)
    }

    # Get the genus name from current taxon
    if common_ancestor.get('rank') == 'genus':
        taxonomy['genus'] = common_ancestor.get('name', '')

    # Get family from name if available
    taxonomy['family'] = common_ancestor.get('preferred_common_name', '').split()[0] if common_ancestor.get('preferred_common_name') else ''

    return taxonomy


def get_i18n(lang):
    return I18N_ZH if lang == 'zh' else I18N_EN


@app.route('/')
def index():
    api_url = os.environ.get('API_URL', '')
    return render_template('index.html', i18n=I18N_ZH, api_url=api_url)


@app.route('/i18n/<lang>')
def get_i18n_route(lang):
    return jsonify(get_i18n(lang))


def call_inaturalist(image_data, content_type, filename, token):
    """Call iNaturalist API"""
    url = 'https://api.inaturalist.org/v2/computervision/score_image'
    files = {'image': (filename, image_data, content_type)}
    headers = {'Authorization': f'Bearer {token}'}

    try:
        response = requests.post(url, files=files, headers=headers, timeout=30)
        print(f"iNaturalist v2 status: {response.status_code}")

        if response.status_code == 200:
            result = response.json()

            if 'results' in result and len(result['results']) > 0:
                common_ancestor = result.get('common_ancestor', {}).get('taxon', {})
                group_taxon_id = common_ancestor.get('id')
                
                # Loop through top results to find a species-level match
                best_taxon = None
                best_score = result['results'][0].get('combined_score', 0) if result['results'] else 0
                
                for idx, item in enumerate(result['results'][:5]):
                    t = item.get('taxon', {})
                    rank_level = t.get('rank_level', 99)
                    
                    # Species level is 10 or below, subspecies is 5-9
                    if rank_level <= 10:
                        best_taxon = t
                        best_score = item.get('combined_score', 0)
                        print(f"  Found species-level: {t.get('name')} (rank_level={rank_level})")
                        break
                    elif idx == 0:
                        # Save first result as fallback
                        best_taxon = t
                        best_score = item.get('combined_score', 0)
                
                # Use best found taxon (or first result as fallback)
                taxon = best_taxon if best_taxon else result['results'][0].get('taxon', {})
                taxon_id = taxon.get('id') or group_taxon_id
                taxon_rank = taxon.get('rank', '')
                taxon_rank_level = taxon.get('rank_level', 99)
                
                # Determine if it's a group or specific species
                is_group = taxon_rank_level > 10  # More specific than genus
                
                # Determine rank for display
                rank_display = taxon.get('rank', common_ancestor.get('rank', ''))
                
                en_name = taxon.get('preferred_common_name') or common_ancestor.get('preferred_common_name') or common_ancestor.get('english_common_name')
                
                # Get scientific name - if group, show genus name, otherwise full species name
                scientific_name = taxon.get('name') or common_ancestor.get('name', '')
                # Fix known taxonomy issues (Spinus -> Chloris for goldfinches)
                scientific_name = fix_taxonomy_genus(scientific_name)
                
                # Try to get Wikipedia URL from species-level result, fall back to group
                wiki_url = taxon.get('wikipedia_url')
                if not wiki_url:
                    # Look through results for a species-level Wikipedia URL
                    for item in result['results'][:5]:
                        t = item.get('taxon', {})
                        if t.get('rank_level', 99) <= 10 and t.get('wikipedia_url'):
                            wiki_url = t.get('wikipedia_url')
                            break
                if not wiki_url:
                    wiki_url = common_ancestor.get('wikipedia_url', '')
                
                photo_url = common_ancestor.get('default_photo', {}).get('medium_url', '')
                
                # Get additional photos from iNaturalist taxon API
                additional_photos = get_taxon_photos(group_taxon_id, token)
                
                # Get Chinese name - try API first, then fallback to translation
                chinese_name = get_chinese_name(taxon_id, token)
                if not chinese_name:
                    chinese_name = translate_species(en_name)
                
                # If it's a group (genus/family level), append rank indicator
                if is_group and chinese_name:
                    rank_cn = {'genus': '属', 'family': '科', 'order': '目', 'subfamily': '亚科'}.get(rank_display, '')
                    if rank_cn:
                        chinese_name = f"{chinese_name}{rank_cn}"
                
                # Get full taxonomy - always use common_ancestor as it has ancestor_ids needed for hierarchy
                taxonomy = get_full_taxonomy(group_taxon_id, common_ancestor)
                taxonomy['is_group'] = is_group
                taxonomy['rank'] = rank_display

                print(f"  Extracted: en_name={en_name}, chinese={chinese_name}, is_group={is_group}, scientific={scientific_name}")

                return {
                    'source': 'iNaturalist',
                    'en_name': en_name or 'Unknown',
                    'chinese_name': chinese_name,
                    'scientific_name': scientific_name,
                    'wiki_url': wiki_url,
                    'taxon_id': taxon_id,
                    'score': best_score,
                    'photo_url': photo_url,
                    'additional_photos': additional_photos,
                    'taxonomy': taxonomy
                }
            else:
                print(f"iNaturalist v2 no results in response")
        return None
    except Exception as e:
        print(f"iNaturalist exception: {e}")
        return None


def get_chinese_name(taxon_id, token):
    """Get Chinese common name from iNaturalist API using locale parameter"""
    if not taxon_id:
        return None
    
    try:
        # Use v2 API with locale parameter to get Chinese name
        url = f'https://api.inaturalist.org/v2/taxa/{taxon_id}'
        params = {'locale': 'zh-CN', 'per_page': 1}
        headers = {'Authorization': f'Bearer {token}'}
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code == 200:
            data = response.json()
            if data.get('results') and len(data['results']) > 0:
                chinese_name = data['results'][0].get('preferred_common_name')
                print(f"  Chinese name: {chinese_name}")
                return chinese_name
        return None
    except Exception as e:
        print(f"  Error getting Chinese name: {e}")
        return None


def get_full_taxonomy(taxon_id, common_ancestor):
    """Get full taxonomy hierarchy from iNaturalist"""
    if not taxon_id:
        return {}

    taxonomy = {
        'taxon_id': taxon_id,
        'rank': common_ancestor.get('rank', ''),
        'species_count': common_ancestor.get('complete_species_count', 0)
    }

    try:
        # Use v1 API which is more reliable
        ancestor_ids = common_ancestor.get('ancestor_ids', [])

        if ancestor_ids:
            # Get the last 6 ancestor IDs (most specific)
            ids_to_fetch = ancestor_ids[-6:] if len(ancestor_ids) > 6 else ancestor_ids
            ids_string = ','.join(map(str, ids_to_fetch))

            url = f'https://api.inaturalist.org/v1/taxa/{ids_string}'
            response = requests.get(url, timeout=10)

            if response.status_code == 200:
                taxa = response.json()

                # v1 returns dict with 'results' key
                if isinstance(taxa, dict):
                    taxa = taxa.get('results', [])

                if isinstance(taxa, list):
                    for taxon in taxa:
                        rank = taxon.get('rank', '')
                        name = taxon.get('name', '')

                        if rank == 'kingdom':
                            taxonomy['kingdom'] = name
                        elif rank == 'phylum':
                            taxonomy['phylum'] = name
                        elif rank == 'class':
                            taxonomy['class'] = name
                        elif rank == 'order':
                            taxonomy['order'] = name
                        elif rank == 'family':
                            taxonomy['family'] = name
                        elif rank == 'subfamily':
                            taxonomy['subfamily'] = name
                        elif rank == 'genus':
                            taxonomy['genus'] = name

                print(f"  Taxonomy: order={taxonomy.get('order')}, family={taxonomy.get('family')}")

    except Exception as e:
        print(f"  Taxonomy error: {e}")

    return taxonomy


def get_taxon_details(taxon_id, token):
    """Get detailed taxonomic information from iNaturalist"""
    if not taxon_id:
        print("  get_taxon_details: no taxon_id")
        return {}

    print(f"  get_taxon_details: fetching taxon {taxon_id}")

    try:
        # Use observations search to get taxon details
        # Observations include full taxon info
        url = 'https://api.inaturalist.org/v2/observations'
        params = {
            'taxon_id': taxon_id,
            'per_page': 1,
            'fields': 'taxon'
        }
        headers = {'Authorization': f'Bearer {token}'}
        response = requests.get(url, params=params, headers=headers, timeout=15)

        print(f"  get_taxon_details response: {response.status_code}")

        if response.status_code == 200:
            data = response.json()
            results = data.get('results', [])

            if results and len(results) > 0:
                obs = results[0]
                taxon = obs.get('taxon', {})
                print(f"  taxon from observation: {taxon.get('name') if taxon else 'None'}")
                print(f"  taxon keys: {list(taxon.keys())[:10] if taxon else []}")

            # Get ancestors (taxonomy hierarchy)
            ancestors = taxon.get('ancestors', [])

            taxonomy = {
                'kingdom': '',
                'phylum': '',
                'class': '',
                'order': '',
                'family': '',
                'genus': ''
            }

            for ancestor in ancestors:
                rank = ancestor.get('rank', '')
                name = ancestor.get('name', '')
                if rank == 'kingdom':
                    taxonomy['kingdom'] = name
                elif rank == 'phylum':
                    taxonomy['phylum'] = name
                elif rank == 'class':
                    taxonomy['class'] = name
                elif rank == 'order':
                    taxonomy['order'] = name
                elif rank == 'family':
                    taxonomy['family'] = name
                elif rank == 'genus':
                    taxonomy['genus'] = name

            # Get conservation status
            taxonomy['conservation_status'] = taxon.get('conservation_status', {})

            # Get observation count
            taxonomy['observations_count'] = taxon.get('observations_count', 0)

            # Get rangemap URL
            taxonomy['rangemap_url'] = f'https://www.inaturalist.org/taxa/{taxon_id}/range'

            return taxonomy

        return {}
    except Exception as e:
        print(f"get_taxon_details error: {e}")
        return {}

        # Try v1 API as fallback
        url_v1 = 'https://api.inaturalist.org/v1/computervision/score_image'
        response_v1 = requests.post(url_v1, files=files, headers=headers, timeout=30)
        print(f"iNaturalist v1 status: {response_v1.status_code}")

        if response_v1.status_code == 200:
            result_v1 = response_v1.json()
            if 'results' in result_v1 and len(result_v1['results']) > 0:
                first = result_v1['results'][0]
                taxon = first.get('taxon', {})
                return {
                    'source': 'iNaturalist',
                    'en_name': taxon.get('preferred_common_name', 'Unknown'),
                    'scientific_name': taxon.get('name', ''),
                    'wiki_url': taxon.get('wikipedia_url', ''),
                    'taxon_id': taxon.get('id', ''),
                    'score': first.get('score', 0),
                    'photo_url': taxon.get('default_photo', {}).get('medium', '') if taxon.get('default_photo') else ''
                }

        return None
    except Exception as e:
        print(f"iNaturalist exception: {e}")
        return None


def call_google_vision(image_base64, api_key):
    """Call Google Cloud Vision API"""
    if not api_key:
        return None

    url = f'https://vision.googleapis.com/v1/images:annotate?key={api_key}'
    payload = {
        'requests': [{
            'image': {'content': image_base64},
            'features': [{'type': 'LABEL_DETECTION', 'maxResults': 10}]
        }]
    }

    try:
        response = requests.post(url, json=payload, timeout=15)
        if response.status_code == 200:
            result = response.json()
            labels = result.get('responses', [{}])[0].get('labelAnnotations', [])
            if labels:
                best_label = labels[0]
                return {
                    'source': 'Google Vision',
                    'en_name': best_label['description'],
                    'score': best_label.get('score', 0)
                }
        return None
    except Exception as e:
        print(f"Google Vision error: {e}")
        return None


def merge_results(inat_result, google_result, lang):
    """Merge results from both sources"""
    sources = []
    taxonomy = {}

    if inat_result:
        # Use Chinese name from iNaturalist API if available, otherwise fall back to translation
        zh_name = inat_result.get('chinese_name') or translate_species(inat_result['en_name'])
        score = min(inat_result['score'] * 100, 100)
        sources.append({
            'source': 'iNaturalist',
            'name': inat_result['en_name'],
            'zh_name': zh_name,  # Use API Chinese name or fallback to translation
            'scientific': inat_result['scientific_name'],
            'score': score,
            'wiki_url': inat_result['wiki_url'],
            'photo_url': inat_result['photo_url']
        })
        # Get taxonomy from iNaturalist result
        if inat_result.get('taxonomy'):
            taxonomy = inat_result['taxonomy']

    if google_result:
        zh_name = translate_species(google_result['en_name'])
        sources.append({
            'source': 'Google Vision',
            'name': google_result['en_name'],
            'zh_name': zh_name,
            'scientific': '',
            'score': google_result['score'] * 100,
            'wiki_url': '',
            'photo_url': ''
        })

    if not sources:
        return None

    final = sources[0].copy()
    final['display_name'] = sources[0]['zh_name'] if lang == 'zh' else sources[0]['name']

    if len(sources) == 2:
        combined = sources[0]['score'] * 0.7 + sources[1]['score'] * 0.3
        final['combined_score'] = round(combined, 1)
        final['sources'] = sources
        final['agreement'] = sources[0]['name'].lower() == sources[1]['name'].lower()
    else:
        final['combined_score'] = sources[0]['score']
        final['sources'] = sources

    # Add taxonomy info
    final['taxonomy'] = taxonomy
    final['rangemap_url'] = taxonomy.get('rangemap_url', '')
    final['observations_count'] = taxonomy.get('observations_count', 0)

    return final


@app.route('/api/identify', methods=['POST'])
def identify():
    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({'error': 'No image selected'}), 400

    lang = request.form.get('lang', 'zh')
    i18n = get_i18n(lang)

    try:
        image_data = file.read()
        image_base64 = base64.b64encode(image_data).decode('utf-8')

        # Get API credentials
        inat_token = os.environ.get('INATURALIST_JWT', '') or os.environ.get('INATURALIST_TOKEN', '')
        google_key = os.environ.get('GOOGLE_CLOUD_API_KEY', '') or os.environ.get('GOOGLE_API_KEY', '')
        
        print(f"DEBUG - INATURALIST_JWT present: {bool(inat_token)}")
        print(f"DEBUG - GOOGLE_CLOUD_API_KEY present: {bool(google_key)}")

        # Check if any API key is configured
        if not inat_token and not google_key:
            return jsonify({
                'success': False,
                'error': i18n.get('error', 'Please configure API key'),
                'setup_required': True,
                'i18n': i18n
            }), 503

        # Call both APIs
        inat_result = None
        google_result = None

        if inat_token:
            inat_result = call_inaturalist(image_data, file.content_type, file.filename, inat_token)

        if google_key:
            google_result = call_google_vision(image_base64, google_key)

        # Check if both failed
        if not inat_result and not google_result:
            return jsonify({
                'success': False,
                'error': i18n.get('no_result', 'Could not identify. Please check your API key.'),
                'api_error': True,
                'i18n': i18n
            })

        # Merge results
        merged = merge_results(inat_result, google_result, lang)

        if merged:
            # Check if result is "Unknown" - this usually means API didn't recognize the image
            if merged['name'] == 'Unknown' or not merged['name']:
                return jsonify({
                    'success': False,
                    'error': i18n.get('no_result', 'Could not identify this bird. Please try a clearer photo.'),
                    'i18n': i18n
                })
            
            # Get AI overview from Gemini
            ai_info = None
            species_for_ai = merged.get('scientific', '') or merged.get('zh_name', '') or merged['name']
            if species_for_ai:
                ai_info = get_gemini_info(species_for_ai, lang)

            return jsonify({
                'success': True,
                'result': {
                    'display_name': merged['display_name'],
                    'en_name': merged['name'],
                    'zh_name': merged.get('zh_name', ''),
                    'scientific_name': merged.get('scientific', ''),
                    'confidence': merged['combined_score'],
                    'wikipedia_url': get_wikipedia_url(merged.get('wiki_url', ''), lang),
                    'photo_url': merged.get('photo_url', ''),
                    'sources': merged.get('sources', []),
                    'agreement': merged.get('agreement', True),
                    'taxonomy': merged.get('taxonomy', {}),
                    'rangemap_url': merged.get('rangemap_url', ''),
                    'observations_count': merged.get('observations_count', 0),
                    'ai_info': ai_info,
                    'i18n': i18n
                }
            })
        else:
            return jsonify({
                'success': False,
                'error': i18n.get('no_result', 'Could not identify this bird'),
                'i18n': i18n
            })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': i18n.get('error', 'An error occurred'),
            'i18n': i18n
        }), 500

        # Try Google Cloud Vision API
        google_api_key = os.environ.get('GOOGLE_CLOUD_API_KEY', '')

        if google_api_key:
            google_url = f'https://vision.googleapis.com/v1/images:annotate?key={google_api_key}'
            google_payload = {
                'requests': [{
                    'image': {'content': image_base64},
                    'features': [{'type': 'LABEL_DETECTION', 'maxResults': 10}]
                }]
            }

            google_response = requests.post(google_url, json=google_payload, timeout=15)
            i18n = get_i18n(lang)

            if google_response.status_code == 200:
                google_result = google_response.json()
                labels = google_result.get('responses', [{}])[0].get('labelAnnotations', [])

                if labels:
                    # Find the best bird label
                    for label in labels:
                        if 'bird' in label['description'].lower():
                            en_name = label['description']
                            score = label.get('score', 0) * 100
                            zh_name = translate_species(en_name)
                            display_name = zh_name if lang == 'zh' else en_name

                            return jsonify({
                                'success': True,
                                'result': {
                                    'en_name': en_name,
                                    'zh_name': zh_name,
                                    'display_name': display_name,
                                    'scientific_name': '',
                                    'confidence': round(score, 1),
                                    'wikipedia_url': '',
                                    'taxon_id': '',
                                    'photo_url': '',
                                    'i18n': i18n
                                }
                            })

                    # No bird found, return best guess
                    if labels:
                        en_name = labels[0]['description']
                        score = labels[0].get('score', 0) * 100
                        zh_name = translate_species(en_name)
                        display_name = zh_name if lang == 'zh' else en_name

                        return jsonify({
                            'success': True,
                            'result': {
                                'en_name': en_name,
                                'zh_name': zh_name,
                                'display_name': display_name,
                                'scientific_name': '',
                                'confidence': round(score, 1),
                                'wikipedia_url': '',
                                'taxon_id': '',
                                'photo_url': '',
                                'i18n': i18n,
                                'is_bird': False,
                                'message': i18n.get('no_result', 'Could not identify as a bird')
                            }
                        })

            # If Google fails, return error
            return jsonify({
                'success': False,
                'error': i18n.get('error', 'API request failed'),
                'i18n': i18n
            }), 500

        # No API key configured - try a simple local matching
        # No API keys configured
        i18n = get_i18n(lang)
        return jsonify({
            'success': False,
            'error': i18n.get('error', 'Please set up an API key'),
            'setup_options': [
                {'name': 'iNaturalist (Recommended)', 'steps': [
                    '1. Go to https://www.inaturalist.org/users/api_token',
                    '2. Log in and copy your JWT token',
                    '3. Run: $env:INATURALIST_JWT="your-token"',
                    '4. Restart the app'
                ]},
                {'name': 'Google Cloud Vision', 'steps': [
                    '1. Go to https://console.cloud.google.com/',
                    '2. Create project and enable Cloud Vision API',
                    '3. Get API key from Credentials page',
                    '4. Run: $env:GOOGLE_CLOUD_API_KEY="your-key"',
                    '5. Restart the app'
                ]}
            ],
            'i18n': i18n
        }), 503

    except Exception as e:
        i18n = get_i18n(lang)
        return jsonify({
            'success': False,
            'error': i18n.get('error', 'An error occurred'),
            'i18n': i18n
        }), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)