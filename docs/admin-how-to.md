# PEERPoint — Admin How-To

**Admin site:** https://admin.mypeerpoint.com  
**Member & staff site:** https://mypeerpoint.com  
**Staff sign-in:** https://mypeerpoint.com/staff  
**Invite setup:** https://mypeerpoint.com/setup or https://admin.mypeerpoint.com/setup  

This guide is for **program administrators** who invite Peer Support Members and oversee the help-request queue.

---

## 1. Sign in (Admin)

1. Open **https://admin.mypeerpoint.com**.
2. Enter your **Admin username** and **password**.
3. Click **Sign in**.

The seed account is username **Admin**. Change the password under **Change password** after first login.

Your session lasts about **12 hours**, or until you sign out or close the tab.

---

## 2. Invite a Peer Support Member

Any Admin can invite **Staff** or **Admin** access. Admins automatically have staff queue rights.

1. Sign in at the Admin site.
2. Under **Invite Peer Support Member**, enter:
   - **First name**
   - **Last name**
   - **Bureau**
   - **Job title**
   - **Email address**
   - **Access:** Staff or Admin
3. Click **Send invite**.
4. If email is configured (Resend), they receive a link. Always keep the **invite link** as a backup and share it privately if needed.
5. The invitee opens the link and finishes registration:
   - Username and password
   - Current shift
   - Cell, home, and work phone numbers
   - Personal and work email addresses

Pending invites appear until they complete setup. You can **Resend** or **Revoke** them.

Staff sign in at **https://mypeerpoint.com/staff**. Additional Admins sign in at **https://admin.mypeerpoint.com**.

---

## 3. Manage accounts

- **Disable / Enable** — block or restore sign-in (except the seed Admin account).
- **Make Admin / Make Staff** — change access level (except the seed Admin account).
- **Change password** — each user updates their own password after login.

---

## 4. Run the request queue

Admins can use the same queue tools as staff:

1. Update **On duty** (comma-separated names) → **Save on-duty list**.
2. Set **Peer display name for assignments** (your name or initials).
3. Click **Refresh** to load new help requests.
4. For an **open** request: review phone, email, and notes → **Assign + generate room code**.
5. **Contact the member** and give them the room code. The app does **not** send the code automatically.
6. Join **Peer chat** and/or **Peer voice** with the same room code (on the member site, or share the code with an on-duty peer).
7. When finished → **Close** the request → **Sign out**.

---

## 5. What members see

On **https://mypeerpoint.com**, members can:

| Area | Purpose |
|------|---------|
| **Request Help** | Submit phone, email, and optional notes for follow-up |
| **Self Help** | Built-in articles (works offline) |
| **Peer chat / Peer voice** | Join with a **room code** you share after assigning |

PEERPoint is peer support, not clinical care or emergency services. Chat and voice are not recorded by the agency in this app.

Crisis options stay visible for members: **988**, **911**, and the peer support line.

---

## 6. Who signs in where

| Role | URL | Credentials |
|------|-----|-------------|
| **Admin** | https://admin.mypeerpoint.com | Username + password |
| **Staff** | https://mypeerpoint.com/staff | Username + password |
| **Invitee** | Link from email (`/setup?token=…`) | Completes registration |

Staff username login is rejected on the production Admin site.

---

## 7. Troubleshooting

| Problem | What to try |
|---------|-------------|
| Admin login on mypeerpoint.com | Prefer **https://admin.mypeerpoint.com** for Admin |
| Staff cannot sign in on Admin site | They must use **https://mypeerpoint.com/staff** |
| Invite email not received | Copy the **invite link** from the Admin site and share privately; check Resend secrets |
| Invite expired | Resend or create a new invite (links expire in 7 days) |
| Queue empty but a member says they submitted | Refresh; offline/local saves on the member’s device never appear in the queue |
| Member never got a room code | Codes are not emailed by the app — you must share them |

---

## 8. Admin checklist

- [ ] Open https://admin.mypeerpoint.com and sign in with your Admin username  
- [ ] Change the seed Admin password after first login  
- [ ] Invite Staff/Admin with profile fields + email  
- [ ] Confirm invitees complete `/setup`  
- [ ] Disable accounts as needed  
- [ ] Keep the on-duty list current; assign and close requests  

**IT notes:** Cloudflare Pages needs `PEERPOINT_KV`, optional `RESEND_API_KEY` + `INVITE_FROM_EMAIL` for email invites.

**Emergencies:** 911 · **Crisis:** 988 · **Peer line:** 801-548-8002 · **Email:** slcosopeersupport@saltlakecounty.gov
