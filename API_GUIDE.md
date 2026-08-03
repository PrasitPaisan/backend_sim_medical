# คู่มือ API ที่ยิงไปเครื่องจริง (RB1500 / NZP360)

เอกสารนี้สรุปว่า "API ของเรา" (endpoint ที่ frontend เรียก) แต่ละตัว ไปสั่ง operation อะไรบนเครื่องจริง, ถ้าอยากดู/แก้ **body (XML)** ต้องไปเปิดไฟล์ไหนฟังก์ชันไหน, และ **header** (Content-Type / Token) มาจากตรงไหน

ทุก endpoint แบบ mutating (ยิงจริง) จะมี endpoint คู่ `.../preview` เสมอ — เรียก preview ก่อนเพื่อดู XML ที่จะส่งจริงแบบไม่ยิงเครื่องจริง (ปลอดภัย ทดสอบได้เรื่อยๆ)

## Header — มาจากไหน

| เครื่อง | ฟังก์ชันสร้าง header | ไฟล์ |
|---|---|---|
| RB1500 | `buildSoapContentType(operation)` — ใส่ตรงๆ ใน object `headers: { 'Content-Type': ... }` ทุกจุดที่ยิง RB1500 | `src/common/soap.util.ts` |
| NZP360 | `buildNzp360Headers(config, operation)` — เรียกครั้งเดียวได้ทั้ง Content-Type + Token (ถ้า `MACHINE_TOKEN_NZP360` ใน `.env` มีค่า) | `src/common/soap.util.ts` |

ถ้าจะเช็คว่า header ที่ยิงจริงหน้าตาเป็นยังไง ให้เปิด `.env` ดูค่า `MACHINE_TOKEN_NZP360` และดูฟังก์ชัน `buildNzp360Headers`/`buildSoapContentType` สองตัวนี้ตรงๆ ได้เลย ทุก service เรียกใช้ร่วมกัน ไม่มีที่ไหนสร้าง header เองแยก

---

## RB1500

| API ของเรา (endpoint) | Operation บนเครื่อง | ฟังก์ชันสร้าง body (XML) | ไฟล์ |
|---|---|---|---|
| `POST /medicines/send` (targetMachine: RB1500) | `SendMedicine` | `buildSoapEnvelopeForSendMedicineRB1500` | `src/medicines/medicines.service.ts` |
| `POST /prescriptions/send-batch`, `/send-rb1500` | `SendPrescription` | `buildSoapEnvelopeForSendPrescriptionBatchRB1500` (ต่อ 1 ใบ: `buildPrescriptionXmlBlockRB1500`) | `src/prescriptions/prescriptions.service.ts` |
| `GET /machine/query-ready` | `QueryReadyPrescription` | `buildSoapEnvelopeForQueryReadyPrescriptionRB1500` | `src/machine/machine.service.ts` |
| `GET /machine/query-basket` (+`/preview`) | `QueryBasket` | `buildSoapEnvelopeForQueryBasketRB1500` | `src/machine/machine.service.ts` |
| `GET /machine/status` (+`/preview`) | `QueryMachineState` | `buildSoapEnvelopeForGetMachineStatusRB1500` | `src/machine/machine.service.ts` |
| `GET /machine/query-cobot-task` (+`/preview`) | `QueryCOBOTTask` | `buildSoapEnvelopeForQueryCobotTaskRB1500` | `src/machine/machine.service.ts` |
| `POST /machine/update-cobot-task` (+`/preview`) | `UpdateCOBOTTask` | `buildSoapEnvelopeForUpdateCobotTaskRB1500` | `src/machine/machine.service.ts` |
| `GET /machine/query-basket-position` (+`/preview`) | `QueryBasketPosition` | `buildSoapEnvelopeForQueryBasketPositionRB1500` | `src/machine/machine.service.ts` |
| `GET /machine/query-inventory` (+`/preview`) | `QueryInventory` | `buildSoapEnvelopeForQueryInventoryRB1500` | `src/machine/machine.service.ts` |
| `POST /machine/update-ready-state` (+`/preview`) | `UpdateReadyPrescriptionState` | `buildSoapEnvelopeForUpdateReadyPrescriptionStateRB1500` | `src/machine/machine.service.ts` |
| `POST /machine/confirm-recheck` (+`/preview`) | `UpdateReadyPrescriptionState` (คนละ endpoint กับด้านบน แต่ยิง operation เดียวกัน — ตัวนี้เซ็ต `pre_state = 1` ในฐานข้อมูลด้วย) | ใช้ builder เดียวกับ `update-ready-state` | `src/machine/machine.controller.ts` → เรียก service เดียวกัน |
| `POST /machine/eliminate-prescription` (+`/preview`) | `ExecEliminatePrescription` | `buildSoapEnvelopeForExecEliminatePrescriptionRB1500` | `src/machine/machine.service.ts` |

---

## NZP360

| API ของเรา (endpoint) | Operation บนเครื่อง | ฟังก์ชันสร้าง body (XML) | ไฟล์ | สถานะทดสอบจริง |
|---|---|---|---|---|
| `POST /medicines/send` (targetMachine: NZP360) | `SendMedicine` | `buildSoapEnvelopeForSendMedicineNZP360` | `src/medicines/medicines.service.ts` | ✅ ยิงได้ |
| `POST /departments`, `/departments/preview` | `SendDeptInfo` | `buildSoapEnvelopeForSendDeptInfoNZP360` | `src/departments/departments.service.ts` | ✅ ยิงได้ |
| `POST /prescriptions/send-batch`, `/send-nzp360` (+`/preview-send-nzp360`) | `SendPrescription` | `buildSoapEnvelopeForSendPrescriptionBatchNZP360` (ต่อ 1 ใบ: `buildPatientInfoXmlBlockNZP360`) | `src/prescriptions/prescriptions.service.ts` | ✅ ยิงได้ |
| `GET /machine/query-inventory-nzp360` (+`/preview`) | `QueryInventory` | `buildSoapEnvelopeForQueryInventoryNZP360` | `src/machine/machine.service.ts` | ✅ ยิงได้ (ได้ข้อมูลจริง) |
| `GET /machine/status-nzp360` (+`/preview`) | `QueryMachineState` | `buildSoapEnvelopeForGetMachineStatusNZP360` | `src/machine/machine.service.ts` | ❌ เครื่องปฏิเสธ "unrecognized operation" |
| `GET /machine/query-packaged-info-nzp360` (+`/preview`) | `QueryPackagedInfo` | `buildSoapEnvelopeForQueryPackagedInfoNZP360` | `src/machine/machine.service.ts` | ❌ เครื่องปฏิเสธ "unrecognized operation" |
| `POST /machine/update-packaged-info-nzp360` (+`/preview`) | `UpdatePackagedInfo` | `buildSoapEnvelopeForUpdatePackagedInfoNZP360` | `src/machine/machine.service.ts` | ❌ เครื่องปฏิเสธ "unrecognized operation" |

---

## วิธีเช็ค body/header ของ call จริงแบบไว — 3 ทาง

1. **เปิดไฟล์ตรงๆ** — ตามตารางด้านบน ทุก builder เป็น `private` method ชื่อขึ้นต้น `buildSoapEnvelopeFor...` อยู่ในไฟล์ service ของ entity นั้น (ดูใน `console.log(...)` ข้างๆ ก็จะเห็นบรรทัดที่ log XML ออกมาด้วย)
2. **ยิง preview endpoint จริงผ่าน curl** — ได้ XML เป๊ะๆ ตามที่จะส่งจริง ไม่กระทบเครื่อง เช่น
   ```
   curl "http://localhost:3001/machine/query-inventory-nzp360/preview?machineId=1&operation=1"
   ```
3. **ดู log ที่ terminal ตอนรัน `npm run start:dev`** — ทุก call (ทั้ง XML ที่ส่งและ response ที่ตอบกลับ) มี `console.log` ไว้ให้แล้ว (ฝั่ง NZP360 response จะถูก unescape ให้อ่านง่ายแล้ว)
