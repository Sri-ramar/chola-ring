import csv
import json
import os
import re
import logging

logger = logging.getLogger("ContactsManager")
logger.setLevel(logging.INFO)

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONTACTS_CSV = os.path.join(_BASE_DIR, "contacts.csv")
CLEAN_JSON = os.path.join(_BASE_DIR, "contacts_clean.json")

def clean_name(raw_name):
    if not raw_name:
        return ""
    # Remove emojis and non-alphanumeric symbols except spaces and basic characters
    cleaned = re.sub(r'[^\w\s\-\.]', '', raw_name, flags=re.UNICODE)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned

def is_valid_person_name(name):
    if not name or len(name) < 2:
        return False
        
    name_lower = name.lower()
    
    # Exclude system/telecom/emergency/utility/business service keywords
    service_keywords = [
        'airtel', 'customer', 'care', 'talktime', 'offer', 'ambulance', 'fire',
        'helpline', 'cybercrime', 'store', 'entertainment', 'service', 'center',
        'courier', 'restaurant', 'hotel', 'mess', 'shop', 'office', 'live',
        'cricket', 'friendzchat', 'tunes', 'demand', 'bank', 'police', 'pg',
        'broadband', 'jio', 'vi', 'vodafone', 'bsnl'
    ]
    
    if any(keyword in name_lower for keyword in service_keywords):
        return False
        
    # Exclude names that are just numbers or start with digits (e.g. "11th English")
    if re.match(r'^\d', name):
        return False
        
    # Ensure name has at least 2 alphabetic letters
    letters = re.findall(r'[A-Za-z]', name)
    if len(letters) < 2:
        return False
        
    return True

def clean_phone(raw_phone):
    if not raw_phone:
        return ""
    # Extract numbers and plus sign
    phone = raw_phone.split(":::")[0].strip()
    digits = re.sub(r'[^\d+]', '', phone)
    
    # Ignore USSD codes or short codes like 121, *121#, 102
    if len(digits) < 8 or digits.startswith('*') or digits.startswith('#'):
        return ""
    
    # Format Indian numbers (+91 XXXXX XXXXX)
    if digits.startswith('+91') and len(digits) == 13:
        return f"+91 {digits[3:8]} {digits[8:]}"
    elif len(digits) == 10 and (digits.startswith('6') or digits.startswith('7') or digits.startswith('8') or digits.startswith('9')):
        return f"+91 {digits[:5]} {digits[5:]}"
    elif digits.startswith('91') and len(digits) == 12:
        return f"+91 {digits[2:7]} {digits[7:]}"
    elif len(digits) >= 10:
        return digits
    return ""

def parse_and_clean_contacts():
    contacts = []
    if not os.path.exists(CONTACTS_CSV):
        logger.error(f"Contacts CSV not found at {CONTACTS_CSV}")
        return contacts

    try:
        with open(CONTACTS_CSV, mode='r', encoding='utf-8', errors='ignore') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            
            for row in reader:
                if not row or len(row) < 21:
                    continue
                
                first = row[0].strip()
                middle = row[1].strip()
                last = row[2].strip()
                
                full_name_raw = f"{first} {middle} {last}".strip()
                name = clean_name(full_name_raw)
                
                if not is_valid_person_name(name):
                    continue
                
                phone_raw = row[20].strip() if len(row) > 20 else ""
                phone = clean_phone(phone_raw)
                
                # Check secondary phone if primary missing/invalid
                if not phone and len(row) > 22:
                    phone = clean_phone(row[22].strip())
                
                if name and phone:
                    contacts.append({
                        "name": name,
                        "raw_name": full_name_raw,
                        "phone": phone,
                        "label": row[19].strip() if len(row) > 19 and row[19] else "Mobile"
                    })
                    
        # Save to JSON cache
        with open(CLEAN_JSON, 'w', encoding='utf-8') as out:
            json.dump(contacts, out, indent=2)
            
        logger.info(f"Loaded and cleaned {len(contacts)} valid person contacts from CSV")
    except Exception as e:
        logger.error(f"Error parsing contacts CSV: {e}")
        
    return contacts

def get_contacts():
    return parse_and_clean_contacts()

def search_contact(query):
    if not query:
        return None
    
    query_clean = re.sub(r'^(call|dial|phone|ring)\s+', '', query.lower().strip())
    query_clean = re.sub(r'[^\w\s]', '', query_clean).strip()
    
    contacts = get_contacts()
    
    # 1. Exact match
    for c in contacts:
        if c['name'].lower() == query_clean:
            return c

    q_words = [w for w in query_clean.split() if len(w) >= 2]
    if not q_words:
        return None

    best_match = None
    best_score = 0
    
    for c in contacts:
        c_name_lower = c['name'].lower()
        c_words = c_name_lower.split()
        
        # Calculate matching for all query words
        word_scores = []
        for qw in q_words:
            qw_score = 0
            for cw in c_words:
                if qw == cw:
                    qw_score = max(qw_score, 20)
                elif cw.startswith(qw) or qw.startswith(cw):
                    qw_score = max(qw_score, 15)
                elif len(qw) >= 4 and len(cw) >= 4 and qw[:4] == cw[:4]:
                    qw_score = max(qw_score, 10)
                elif qw in c_name_lower:
                    qw_score = max(qw_score, 5)
            word_scores.append(qw_score)
            
        # Total score requires all query words to match if there are multiple words!
        if len(q_words) > 1:
            if all(s > 0 for s in word_scores):
                total_score = sum(word_scores)
            else:
                total_score = 0
        else:
            total_score = sum(word_scores)

        if total_score > best_score:
            best_score = total_score
            best_match = c
            
    if best_match and best_score >= 10:
        return best_match
        
    return None

if __name__ == "__main__":
    c_list = parse_and_clean_contacts()
    print(f"Total cleaned person contacts: {len(c_list)}")
    print("\nTesting 'saravana rit':", search_contact("saravana rit"))
    print("Testing 'swetha':", search_contact("swetha"))
