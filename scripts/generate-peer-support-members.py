import json
import re
from pathlib import Path

RAW = r"""
Craig Smith|Sheriff's Office|385-468-8988|ctsmith@saltlakecounty.gov||Days/On Call|Program Manager|leader
Kevin Hunter|CB|385-468-8735|khunter@saltlakecounty.gov|385-258-4314|Days/On Call|Chair|leader
Mike Johnson|Grant Coordinator|385-468-8988|mijohnson@saltlakecounty.gov|801-243-9768||Grant Coordinator|leader
Dustin Fowler|LEB|385-468-8797|dfowler@saltlakecounty.gov|801-707-4082|Days|Co-Chair|leader
Mark Haws|PSB|385-468-9893|mhaws@saltlakecounty.gov|801-419-1083|Days|Co-Chair|leader
Mike Russell|Human Resources||mjrussell@saltlakecounty.gov|801-386-3945|M-F 0800-1600|Facilitator/HR Sgt.|staff
Jeanne Gibbs|Mental Health|385-468-8595|JMgibbs@saltlakecounty.gov|385-321-0669|Days|Mental Health Partner|staff
Carri Jensen|Oxbow|385-468-8804|cljensen@saltlakecounty.gov|801-330-9373|Days|Team Leader|leader
Jodie Sampson|LEB|385-226-2376|jsampson@saltlakecounty.gov|801-979-8046|Days|Team Leader|leader
Kiel Knuteson|PSB|385-258-5478|kknuteson@saltlakecounty.gov|385-258-5478|Days|Team Leader|leader
Nicole Garrett|LEB|385-468-8859|ngarrett@saltlakecounty.gov|801-830-6245|All, on call|Team Leader|leader
Alex Layton|MCIRT||alayton@saltlakecounty.gov|801-712-3171|Days-B Squad|Team Member|staff
Amanda Anderson|FISCAL|385-468-9878|aanderson@saltlakecounty.gov|801-910-5502|0700 - 1500 M-F|Team Member|staff
Andrew Moore|CB||amoore@saltlakecounty.gov||Days|Team Member|staff
Andrew Smith|CB||ajsmith@saltlakecounty.gov||Days|Team Member|staff
Arlan Bennett|LEB|385-468-9859|arbennett@saltlakecounty.gov|385-547-4256|Days|Team Member|staff
Ashley Sawyer|CB|385-468-8631|asawyer@saltlakecounty.gov|385-414-7884|Afternoon|Team Member|staff
Ben Romney|M/CIRT||bromney@saltlakecounty.gov|801-450-3382|Days|Team Member|staff
Brixton Anderson|M/CIRT|385-468-8400|banderson@saltlakecounty.gov|801-664-1512|B squad days|Team Member|staff
Carrie Sipple|Oxbow/Programs|385-468-8802|clsipple@saltlakecounty.gov|801-450-9496|Graves|Team Member|staff
Catherine Edminster|CB|385-468-8596|cedminster@saltlakecounty.gov|619-361-5681|Days|Team Member|staff
Citlali Vargas|CB||cvargas@saltlakecounty.gov|||Team Member|staff
Corbin Hansen|CB||cahansen@saltlakecounty.gov|385-354-1445|Days|Team Member|staff
Craig Curdie|M-CIRT|385-468-8490|crcurdie@saltlakecounty.gov|801-889-9971|Days 12 hr A squad|Team Member|staff
Danny Milne|CB||dmilne@saltlakecounty.gov||Days|Team Member|staff
Elias Johnson|CB||ejohnson@saltlakecounty.gov|||Team Member|staff
Emelie Sundwall|APOD|385-468-8410|Esundwall@saltlakecounty.gov|801-673-5799|Days B-Squad|Team Member|staff
Eshte Green|LEB||egreen@saltlakecounty.gov|385-547-4235|Days|Team Member|staff
Ginny Peck|Housing||gpeck@saltlakecounty.gov|801-628-6280|Days A-Squad|Team Member|staff
Glenn Sullivan|Training|385-468-9860|Gsullivan@saltlakecounty.gov|801-718-9349|Days Admin M-F|Team Member|staff
Jared Kammerman|BRAVO POD||jkammerman@saltlakecounty.gov|385-343-2167|Days 12 hr B squad|Team Member|staff
Jean Stoddard|ADC MAT Dept.|385-468-8474|Jstoddard@saltlakecounty.gov|916-765-8511|8-4 PM|Team Member|staff
Jennifer Chapman|CB||jchapman@saltlakecounty.gov|801-556-9866|Graves|Team Member|staff
Jerold Jacobsen|LEB||jjacobsen@saltlakecounty.gov|801-503-7668|Days|Team Member|staff
Joey Glismann|PSB|385-215-6626|jglismann@saltlakecounty.gov|801-678-8175|Days|Team Member|staff
John VonGunten|PSB|385-315-8267|jvongunten@saltlakecounty.gov|801-712-0590|Days|Team Member|staff
Justin Gundry|Oxbow|385-468-8811|Jgundry@saltlakecounty.gov|801-205-3899|Dayshift|Team Member|staff
Kaley Zenger|Processing|385-468-8470|kzenger@saltlakecounty.gov|801-815-8879|Days|Team Member|staff
Kassandra Peterson|Training - Professional Standards Division|385-468-9699|kpeterson@saltlakecounty.gov|385-468-2341|Days M-F|Team Member|staff
Keri Camomile|CB||kcamomile@saltlakecounty.gov|801-243-3263|Days|Team Member|staff
Kevin Schwieger|Court transport|385-468-8499|Kschwieger@saltlakecounty.gov|916-223-6385|Days M-F|Team Member|staff
Lindsey Mosley|HR|385-469-9886|lmosley@saltlakecounty.gov||0900-1700 M-F|Team Member|staff
Lisa Smith|LEB||lrsmith@saltlakecounty.gov||Days|Team Member|staff
Logan Sauter|CB||lsauter@saltlakecounty.gov|||Team Member|staff
Logan Ashinhurst|Health Services||lashinhurst@saltlakecounty.gov|801-688-2514|A Graves|Team Member|staff
Marcie Atkinson|CB|385-468-8556|Matkinson@saltlakecounty.gov|801-755-3483|Days|Team Member|staff
Mateo Khan|Alpha POD||mkhan@saltlakecounty.gov|208-697-7328|B Squad|Team Member|staff
Maya Medina|CB||mmedina@saltlakecounty.gov|||Team Member|staff
Mai Vollmer|Control|385-468-8505|mvollmer@saltlakecounty.gov|801-703-4723|Days|Team Member|staff
Michael Rowley|PSB||mrowley@saltlakecounty.gov|||Team Member|staff
Michael Thompson|CB||mthompson@saltlakecounty.gov|801-599-5576|Graves 12 hr B squad|Team Member|staff
Michelle Peterson|Jails Processing Division|385-468-8461|mipeterson@saltlakecounty.gov|801-403-1811|Graves 1800-0600|Team Member|staff
Newell Mann|PSB||nmann@saltlakecounty.gov|385-221-8044|Days, M-F 8a-5p, Matheson Courthouse|Team Member|staff
Nick Weekes|Prisoner Management|385-468-8550|Nweekes@saltlakecounty.gov|801-707-9677|Days 8 HR|Team Member|staff
Paul Malouf|LEB|385-468-9769|pmalouf@saltlakecounty.org|385-547-4228|Days|Team Member|staff
Reagan Bodily|MCIRT||rbodily@saltlakecounty.gov|385-630-5348|Days|Team Member|staff
Rikki Jackson|Health Services|385-468-8570|Rjackson@saltlakecounty.gov|801-793-8848|Days 12 hr B squad|Team Member|staff
Robert Miner|CB||rminer@saltlakecounty.gov||Graves|Team Member|staff
Ryan Lim|LEB||rlim@saltlakecounty.gov|||Team Member|staff
Sam Smith|PSB|385-468-9695|ssmith@saltlakecounty.gov|801-548-8002|Days M-F|Team Member|staff
Scott Ferrin|PSB||sferrin@saltlakecounty.gov|801-376-8961|Days|Team Member|staff
Sean Johnson|CB||sejonson@saltlakecounty.gov|760-912-8177|Days|Team Member|staff
Skyler Anderson|CB||sanderson@saltlakecounty.gov|801-245-9112|Days M-F|Team Member|staff
Stephen Done|CB||sdone@saltlakecounty.gov|775-315-7110|B squad day shift|Team Member|staff
Steven Gibson|PSB|385-272-9080|sgibson@saltlakecounty.gov|385-272-9080|Graves|Team Member|staff
Steven Worona|PSB||sworona@saltlakecounty.gov|801-872-3078|Days|Team Member|staff
Tammy Russell|CB|385-468-9691|trussell@saltlakecounty.gov||Days M-Thu|Team Member|staff
Taran McFarland|PSB|385-468-9693|tmcfarland@saltlakecounty.gov|385-977-3248|Days M-F|Team Member|staff
Wade Sipple|processing|385-468-8450|wsipple@saltlakecounty.gov|480-560-2986|Graves|Team Member|staff
Zackary Olpin|Oxbow|385-468-8803|Zolpin@saltlakecounty.gov|801-205-8865|Days M-F|Team Member|staff
"""

# Real emails from the Smartsheet where available (override synthetic guesses)
EMAIL_OVERRIDES = {
    "Craig Smith": "ctsmith@saltlakecounty.gov",
    "Kevin Hunter": "khunter@saltlakecounty.gov",  # sheet had name in email field
    "Mike Johnson": "mijohnson@saltlakecounty.gov",
    "Dustin Fowler": "dfowler@saltlakecounty.gov",
    "Mark Haws": "mhaws@saltlakecounty.gov",
    "Mike Russell": "mjrussell@saltlakecounty.gov",
    "Jeanne Gibbs": "JMgibbs@saltlakecounty.gov",
    "Carri Jensen": "cljensen@saltlakecounty.gov",
    "Jodie Sampson": "jsampson@saltlakecounty.gov",
    "Nicole Garrett": "ngarrett@saltlakecounty.gov",
    "Amanda Anderson": "aanderson@saltlakecounty.gov",
    "Andrew Smith": "ajsmith@saltlakecounty.gov",
    "Arlan Bennett": "arbennett@saltlakecounty.gov",
    "Ashley Sawyer": "asawyer@saltlakecounty.gov",
    "Ben Romney": "bromney@saltlakecounty.gov",
    "Brixton Anderson": "banderson@saltlakecounty.gov",
    "Carrie Sipple": "clsipple@saltlakecounty.gov",
    "Catherine Edminster": "cedminster@saltlakecounty.gov",
    "Citlali Vargas": "cvargas@saltlakecounty.gov",
    "Corbin Hansen": "cahansen@saltlakecounty.gov",
    "Craig Curdie": "crcurdie@saltlakecounty.gov",
    "Danny Milne": "dmilne@saltlakecounty.gov",
    "Emelie Sundwall": "Esundwall@saltlakecounty.gov",
    "Ginny Peck": "gpeck@saltlakecounty.gov",
    "Glenn Sullivan": "Gsullivan@saltlakecounty.gov",
    "Jared Kammerman": "jkammerman@saltlakecounty.gov",
    "Jean Stoddard": "Jstoddard@saltlakecounty.gov",
    "Jennifer Chapman": "jchapman@saltlakecounty.gov",
    "Joey Glismann": "jglismann@saltlakecounty.gov",
    "John VonGunten": "jvongunten@saltlakecounty.gov",
    "Justin Gundry": "Jgundry@saltlakecounty.gov",
    "Kaley Zenger": "kzenger@saltlakecounty.gov",
    "Keri Camomile": "kcamomile@saltlakecounty.gov",
    "Kevin Schwieger": "Kschwieger@saltlakecounty.gov",
    "Lindsey Mosley": "lmosley@saltlakecounty.gov",
    "Lisa Smith": "lrsmith@saltlakecounty.gov",
    "Logan Sauter": "lsauter@saltlakecounty.gov",
    "Logan Ashinhurst": "lashinhurst@saltlakecounty.gov",
    "Marcie Atkinson": "Matkinson@saltlakecounty.gov",
    "Mateo Khan": "mkhan@saltlakecounty.gov",
    "Maya Medina": "mmedina@saltlakecounty.gov",
    "Mai Vollmer": "mvollmer@saltlakecounty.gov",
    "Michael Thompson": "mthompson@saltlakecounty.gov",
    "Michelle Peterson": "mipeterson@saltlakecounty.gov",
    "Nick Weekes": "Nweekes@saltlakecounty.gov",
    "Paul Malouf": "pmalouf@saltlakecounty.org",
    "Rikki Jackson": "Rjackson@saltlakecounty.gov",
    "Robert Miner": "rminer@saltlakecounty.gov",
    "Ryan Lim": "rlim@saltlakecounty.gov",
    "Sam Smith": "ssmith@saltlakecounty.gov",
    "Sean Johnson": "sejonson@saltlakecounty.gov",
    "Stephen Done": "sdone@saltlakecounty.gov",
    "Steven Worona": "sworona@saltlakecounty.gov",
    "Zackary Olpin": "Zolpin@saltlakecounty.gov",
}


def clean_phone(p: str) -> str:
    p = (p or "").strip()
    if not p or p.lower().startswith("no desk"):
        return ""
    return re.sub(r"[^\d+()\-.\s]", "", p).strip()


def make_username(first: str, last: str, used: set[str], email: str) -> str:
    """Login username is the work email (lowercased)."""
    base = email.strip().lower()
    if not base or "@" not in base:
        base = re.sub(r"[^a-z0-9._-]", "", f"{first}.{last}".lower())
    u = base
    i = 2
    while u in used:
        # Extremely rare: duplicate email in source — suffix local-part
        local, _, domain = base.partition("@")
        u = f"{local}{i}@{domain}" if domain else f"{base}{i}"
        i += 1
    used.add(u)
    return u


def initial_password(first: str, last: str) -> str:
    # lowercase first initial + last name + 1234 (e.g. Sam Smith -> ssmith1234)
    fi = first.strip()[0].lower()
    ln = re.sub(r"[^A-Za-z'-]", "", last.strip()).lower()
    return f"{fi}{ln}1234"


members = []
used: set[str] = set()
for line in RAW.strip().splitlines():
    name, area, work, email, cell, shift, title, role = line.split("|")
    first, *rest = name.split()
    last = " ".join(rest)
    email = EMAIL_OVERRIDES.get(name, email.strip())
    if "@" not in email:
        email = f"{first}.{last}@peerpoint.local".lower().replace(" ", "")
    un = make_username(first, last.replace(" ", ""), used, email)
    members.append(
        {
            "title": name,
            "firstName": first,
            "lastName": last,
            "username": un,
            "area": area,
            "workPhone": clean_phone(work),
            "email": email,
            "cellPhone": clean_phone(cell),
            "shift": shift,
            "jobTitle": title,
            "appRole": "staff",
            "isPeerSupportLeader": role == "leader",
            "active": True,
            "aclGroup": "PeerSupport_PeerSupporters",
        }
    )
    # Passwords are computed at provision time (never written to SharePoint).
    _ = initial_password(first, last.replace(" ", ""))

out = Path(__file__).resolve().parents[1] / "data" / "peer-support-members.json"
out.parent.mkdir(exist_ok=True)
payload = {
    "source": "Smartsheet Peer Support Team",
    "passwordPattern": "lowercase firstInitial + lastName + 1234 (example: Sam Smith -> ssmith1234). Computed at provision time; never store in SharePoint.",
    "note": "Passwords are for PWA account bootstrap only. Never store passwords in SharePoint.",
    "members": members,
}
out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
print(f"Wrote {len(members)} members to {out}")
print("Leaders:", sum(1 for m in members if m["isPeerSupportLeader"]))
sample_pw = initial_password(members[0]["firstName"], members[0]["lastName"].replace(" ", ""))
print("Sample:", members[0]["username"], sample_pw)
