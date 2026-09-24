# PEERPoint — Administrator / Staff How-To Manual

**Member / staff app:** [https://mypeerpoint.com](https://mypeerpoint.com)  
**Staff workspace:** [https://mypeerpoint.com/staff](https://mypeerpoint.com/staff)  
**Admin site (required for Admin login):** [https://admin.mypeerpoint.com](https://admin.mypeerpoint.com)

**Admin-only how-to (downloadable):** [admin-how-to.md](./admin-how-to.md) — also available as Word and PDF from the Admin workspace (`/docs/PEERPoint-Admin-How-To.docx` and `.pdf`).

This guide is for **peer support staff, therapists, and program administrators** who handle help requests and join members in chat or voice. Technical deploy steps for IT are summarized at the end.

---

## 1. What PEERPoint is (and is not)

PEERPoint is a **peer support** web app. Members can:

| Area | What it does |
|------|----------------|
| **Request Help** | Submit contact info so staff can follow up |
| **Self Help** | Read built-in articles (works offline; nothing is sent to a server) |
| **Peer chat** | Text chat with a peer in a shared **room code** |
| **Peer voice** | One-to-one voice call with a peer using the same **room code** |

It is **not** clinical care, crisis counseling, or emergency services. Chat and voice are **not recorded** by the agency in this app. There is **no** Microsoft / work-account sign-in for members.

A **crisis strip** stays visible on member pages:

- **988** — call or text for crisis support  
- **911** — emergencies  
- **Peer support** — phone `801-548-8002`, text, or email `slcosopeersupport@saltlakecounty.gov`

---

## 2. Who signs in where

| Role | URL | Credentials |
|------|-----|-------------|
| **Staff** (peers / therapists) | `https://mypeerpoint.com/staff` | **Username + password** (after invite setup) |
| **Admin** (program lead) | `https://admin.mypeerpoint.com` | **Username + password** (seed: `Admin`) |

Staff username login is **rejected** on the production Admin site.

---

## 3. Quick start for staff (daily workflow)

1. Open **[https://mypeerpoint.com/staff](https://mypeerpoint.com/staff)**.
2. Enter your **work email** and **password** → **Sign in**.
3. If you received a temporary password (lowercase first initial + last name + `1234`, e.g. `ssmith1234`), the app **requires** you to set a new password before you can use staff tools.
4. Update the **On duty** list → **Save on-duty list**.
5. Confirm **Peer display name for assignments**.
6. Click **Refresh** when you expect new requests.
7. For an **open** request: review phone, email, and notes → **Assign + generate room code**.
8. **Contact the member** and give them the **room code**. The app does **not** send the code automatically.
9. Open **Peer chat** and/or **Peer voice** with the **same room code**.
10. When finished → **Close** the request → **Sign out**.

Lost or forgotten password: on the sign-in page click **Forgot password?**, enter your username or email, and use the reset link (expires in 1 hour). Resend email must be configured.

Your session lasts about **12 hours** or until you sign out / close the tab.

---

## 4. Quick start for Admin

1. Open **[https://admin.mypeerpoint.com](https://admin.mypeerpoint.com)**.
2. Sign in with your **Admin username** and **password** (seed account: `Admin`).
3. Under **Invite Peer Support Member**, enter first/last name, bureau, job title, email, and access (**Staff** or **Admin**).
4. Click **Send invite**. Share the invite link if email is not configured yet.
5. Invitees finish registration on `/setup` (username, password, phones, emails, shift).
6. Use **Disable**, role change, or **Resend/Revoke** pending invites as needed.
7. Use the same queue tools (on duty, assign, close) as staff — Admins inherit staff rights.

Change your password under **Change password** in the app.

---

## 5. Staff workspace (`/staff` on mypeerpoint.com)

### Sign in

- Username + password assigned by Admin.
- Wrong credentials → try again. If the API is unavailable, IT must check Functions, `PEERPOINT_KV`, and secrets.

### Change password

- Available after staff login.
- Requires current password; new password must be at least 8 characters.

### On duty / Assign / Requests

Same operational flow as before: refresh queue, assign room codes, open chat/voice, close when done.

---

## 6. How members reach you (Request Help)

Members use **Home** or **Request Help** on **mypeerpoint.com** (`/` or `/request`).

They must provide:

- **Phone number**
- **Email**
- **Consent** that this is peer support (not clinical/emergency) and that staff may contact them

Optional: name, preferred contact method, short description.

After submit, they see confirmation that staff will follow up and may share a **room code**.

**Staff must** watch the queue, contact the member, and share the room code after assigning.

### Offline / failed submissions

If the member’s device cannot reach the server, the form may save a copy **only on that member’s device**. Those local copies **do not appear** in the staff queue.

---

## 7. Chat and voice handoff

1. Assign the request so a code is generated.
2. Tell the member the code clearly.
3. **Peer chat** — text (more than two people can share a code). **Peer voice** — **one-to-one** only.
4. Join with the same room code and a display name; **Close** when done.

---

## 8. Safety and privacy

- Immediate danger → **911**. Crisis → **988**.
- Do not paste room codes or member PII into public channels.

---

## 9. Troubleshooting

| Problem | What to try |
|---------|-------------|
| Admin login on mypeerpoint.com fails | Prefer **https://admin.mypeerpoint.com** |
| Staff cannot sign in on Admin site | Use **https://mypeerpoint.com/staff** with username |
| Invite email not received | Copy the invite link from Admin; set `RESEND_API_KEY` + `INVITE_FROM_EMAIL` |
| Forgot password | On sign-in click **Forgot password?** and use the email reset link. If email is not configured, ask an Admin to set a temporary password (you must change it on next login). |
| Queue empty but member submitted | Refresh; confirm success; offline local saves never hit the queue |
| Room code / join link not received | After Assign/Accept, check the Staff toast for email/SMS status. Configure Resend + Twilio; otherwise share the room code or join link manually |

---

## 10. Technical setup (IT)

### Domains (Pages project `peer-support-pwa`)

| Host | Purpose |
|------|---------|
| `mypeerpoint.com` / `www` | Member app + staff login + invite `/setup` |
| `admin.mypeerpoint.com` | Admin login + invites + queue |

Add `admin.mypeerpoint.com` as a **Custom domain** on the same Pages project (CNAME to `peer-support-pwa.pages.dev`, proxied).

### Secrets and bindings

| Name | Purpose |
|------|---------|
| `RESEND_API_KEY` | Optional — send invite emails |
| `INVITE_FROM_EMAIL` | Optional — verified From address in Resend |
| `TWILIO_ACCOUNT_SID` | Optional — Twilio.org SMS (join-link texts to member + staff) |
| `TWILIO_AUTH_TOKEN` | Optional — Twilio Auth Token |
| `TWILIO_FROM_NUMBER` | Optional — Twilio From number in E.164 (`+1801…`) |
| `ABLY_API_KEY` | Token auth for chat/voice |
| `TEAMS_WEBHOOK_URL` | Optional intake alerts |
| `PEERPOINT_KV` | **Required** for accounts, invites, sessions |

Set Twilio interactively from `apps/pwa`: `.\scripts\set-twilio-secrets.ps1`. After secrets are set, use Admin → **Test App Functions** → **SMS** to send a test text.

When a room is assigned/accepted, Staff see a delivery summary (member/staff email + SMS). Email remains the backup if SMS is off or a phone is missing.

### Build

| Variable | Purpose |
|----------|---------|
| `VITE_ABLY_AUTH_URL=/api/ably-token` | Production token auth |
| `VITE_ABLY_KEY` | Local/dev only |
| `VITE_WEBRTC_ICE_JSON` | Optional TURN |

Deploy overview: [dev-and-preview.md](./dev-and-preview.md).

---

## 11. Checklists

### Staff

- [ ] `https://mypeerpoint.com/staff` → username + password  
- [ ] Change password after first login  
- [ ] Update on-duty / assign / share room code / close  

### Admin

- [ ] `https://admin.mypeerpoint.com` → Admin username + password  
- [ ] Invite Staff/Admin; share invite link if email is pending  
- [ ] Confirm invitees complete `/setup`; disable accounts as needed  

**Emergencies:** 911 · **Crisis:** 988 · **Peer line:** 801-548-8002 · **Email:** slcosopeersupport@saltlakecounty.gov
