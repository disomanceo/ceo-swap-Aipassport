# CEO SWAP — AI Passport ⇄ ChatGPT Pair Bridge

Manifest V3 extension สำหรับจับคู่ TH-AI Passport กับ ChatGPT เป็น **คู่การทำงานเดียวกัน** ก่อนส่ง Prompt หรือส่งผลกลับ โดยไม่สลับ Ceo Runtime และไม่กด Send อัตโนมัติ

## หลักการ V3 / Pair Bridge

CEO SWAP ใช้การตรวจสามชั้น:

1. **Project ID** — ต้องเป็นโปรเจ็คเดียวกัน
2. **Pair ID** — ต้องเป็นคู่การสนทนาชุดเดียวกัน เช่น `SWP-A1B2C3D4`
3. **Tab ID** — ต้องมาจากแท็บ AI Passport และ ChatGPT ที่จับคู่ไว้จริง

ถ้าอย่างใดอย่างหนึ่งไม่ตรง ระบบจะปฏิเสธการส่ง (`PAIR_ID_MISMATCH`, `PAIR_PROJECT_MISMATCH`, `PAIR_SENDER_MISMATCH`)

## Flow

`AI Passport → เลือก Project → เชื่อม ChatGPT → Pair WAITING → ChatGPT ยืนยัน → MATCHED`

เมื่อ MATCHED แล้ว:

`AI Passport --ส่งไป ChatGPT--> ChatGPT --ส่งกลับ AI Passport--> AI Passport`

ทั้งสองทิศทางเป็นการ **กรอกข้อความ/ส่งผ่าน bridge เท่านั้น** ผู้ใช้ยังเป็นคนกด Send ในหน้า AI จริง

## ฝั่ง AI Passport

- ปุ่ม `SWAP`
- Project Selector
- ปุ่ม `เชื่อม ChatGPT`
- แสดง Pair Code และสถานะ `WAITING / MATCHED`
- ปุ่ม `ส่งไป ChatGPT` จะเปิดได้เฉพาะเมื่อ Pair MATCHED
- เมื่อ ChatGPT ส่งกลับ จะแสดงข้อความใน Preview
- ปุ่ม `ใส่ใน AI Passport` จะกรอกข้อความกลับลง composer โดยไม่กดส่ง
- ปุ่ม `ยกเลิก Pair` ใช้ตัดการเชื่อมโยงเดิม

## ฝั่ง ChatGPT

- แถบ `CEO SWAP`
- แสดง Project + Pair Code เดียวกับ AI Passport
- เมื่อได้รับ Prompt จาก AI Passport จะกรอกลง ChatGPT composer
- ไม่กด Send อัตโนมัติ
- ปุ่ม `ส่งกลับ AI Passport` ใช้ข้อความที่ผู้ใช้เลือก หรือคำตอบ assistant ล่าสุด
- ส่งกลับได้เฉพาะ Pair ที่ MATCHED

## @Ceo3

ข้อความจาก AI Passport ที่ส่งเข้า ChatGPT จะมี metadata:

- Project
- Project ID
- Workspace
- SWAP Pair
- Source
- `[SWAP PROMPT] ... [/SWAP PROMPT]`

ดังนั้น `@Ceo3` มีตัวระบุโปรเจ็คและ Pair ให้ตรวจบริบทได้โดยไม่ต้องสลับ Runtime จาก Extension

## ไม่มี Runtime Switching

Pair Bridge mode **ไม่เรียก**:

- `127.0.0.1:8910`
- `/api/launcher-config`
- `/api/update/activate-local`
- Ceo blue/green runtime handoff

Extension ทำหน้าที่เป็นตัวกลางจับคู่ browser tabs เท่านั้น

## ติดตั้งทดสอบ

1. เปิด `chrome://extensions` หรือ `edge://extensions`
2. เปิด Developer mode
3. Load unpacked
4. เลือก `D:\AI-Workspace\ceo-swap-Aipassport`
5. รีเฟรชหน้า AI Passport และ ChatGPT หลังโหลด Extension
6. ที่ AI Passport กด `SWAP`
7. เลือก Project แล้วกด `เชื่อม ChatGPT`
8. รอทั้งสองหน้าขึ้น Pair Code เดียวกันและ `MATCHED`
9. กด `ส่งไป ChatGPT`
10. ที่ ChatGPT ตรวจข้อความและกด Send เอง
11. เมื่อต้องการส่งผลกลับ กด `ส่งกลับ AI Passport`
12. ที่ AI Passport ตรวจข้อความ แล้วกด `ใส่ใน AI Passport` หากต้องการใช้ต่อ

## Validation

```powershell
npm test
```

Smoke test ตรวจอย่างน้อย:

- สร้าง Pair ID
- ผูก AI Passport Tab ID + ChatGPT Tab ID
- ต้อง WAITING ก่อนอีกฝั่งยืนยัน
- MATCHED หลังยืนยัน Pair/Project ถูกต้อง
- Pair ID ผิดถูกบล็อก
- Project ID ผิดถูกบล็อก
- Tab ID ผิดถูกบล็อก
- ส่ง AI Passport → ChatGPT ถูกแท็บ
- ส่ง ChatGPT → AI Passport ถูกแท็บ
- ไม่มี Runtime-switch code/permission ค้างอยู่

## ถัดไป

- แสดงชื่อ conversation ของแต่ละฝั่งใน Pair
- รองรับหลาย Pair พร้อมกันสำหรับหลาย Project (ปัจจุบัน active pair เดียวต่อ Extension profile)
- ประวัติ round-trip ต่อ Pair
- optional explicit auto-send ภายหลัง หากต้องการและมี safety guard แยกต่างหาก
