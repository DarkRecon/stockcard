const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();
const db = new sqlite3.Database("./stockcard.db");
const PORT = 3000;

const ADMIN_PASSWORD = "89752123";
const ADMIN_TOKEN = "stockcard-admin-token-2026";

app.use(cors());
app.use(express.json());

function runAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function allAsync(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (token !== ADMIN_TOKEN) {
    return res.status(403).json({ error: "ไม่มีสิทธิ์ใช้งานส่วนนี้" });
  }
  next();
}

function isAdminRequest(req) {
  const token = req.headers["x-admin-token"];
  return token === ADMIN_TOKEN;
}

async function initDb() {
  await runAsync(`PRAGMA foreign_keys = ON`);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS medicines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      lot_no TEXT NOT NULL,
      exp_date TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE
    )
  `);

  await runAsync(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      medicine_id INTEGER NOT NULL,
      batch_id INTEGER,
      type TEXT NOT NULL CHECK(type IN ('receive','dispense')),
      amount INTEGER NOT NULL,
      receiver TEXT,
      dispenser TEXT,
      remark TEXT DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE CASCADE,
      FOREIGN KEY (batch_id) REFERENCES batches(id) ON DELETE SET NULL
    )
  `);
}

async function getDashboard() {
  const medicineCountRow = await getAsync(`SELECT COUNT(*) AS total FROM medicines`);

  const expiringSoonRows = await allAsync(`
    SELECT
      b.id,
      b.exp_date,
      COALESCE(SUM(CASE WHEN l.type='receive' THEN l.amount ELSE -l.amount END), 0) AS balance
    FROM batches b
    LEFT JOIN logs l ON l.batch_id = b.id
    GROUP BY b.id, b.exp_date
  `);

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() + 6);

  let expiringSoonCount = 0;
  for (const row of expiringSoonRows) {
    const exp = new Date(`${row.exp_date}T00:00:00`);
    if (row.balance > 0 && !Number.isNaN(exp.getTime()) && exp >= now && exp <= cutoff) {
      expiringSoonCount += 1;
    }
  }

  return {
    medicineCount: Number(medicineCountRow?.total || 0),
    expiringSoonCount,
  };
}

async function listMedicinesWithBalance() {
  return await allAsync(`
    SELECT
      m.id,
      m.name,
      COALESCE(SUM(CASE WHEN l.type='receive' THEN l.amount ELSE -l.amount END), 0) AS balance
    FROM medicines m
    LEFT JOIN logs l ON l.medicine_id = m.id
    GROUP BY m.id, m.name
    ORDER BY m.name ASC
  `);
}

async function getBatchReceivedAmount(batchId) {
  const row = await getAsync(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM logs WHERE batch_id = ? AND type = 'receive'`,
    [batchId]
  );
  return Number(row?.total || 0);
}

async function getBatchDispensedAmount(batchId, excludeLogId = null) {
  if (excludeLogId) {
    const row = await getAsync(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM logs WHERE batch_id = ? AND type = 'dispense' AND id != ?`,
      [batchId, excludeLogId]
    );
    return Number(row?.total || 0);
  }

  const row = await getAsync(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM logs WHERE batch_id = ? AND type = 'dispense'`,
    [batchId]
  );
  return Number(row?.total || 0);
}

async function getAvailableBatchesForMedicine(medicineId) {
  return await allAsync(
    `
    SELECT
      b.id,
      b.medicine_id,
      b.lot_no,
      b.exp_date,
      b.created_at,
      COALESCE(SUM(CASE WHEN l.type='receive' THEN l.amount ELSE -l.amount END), 0) AS balance
    FROM batches b
    LEFT JOIN logs l ON l.batch_id = b.id
    WHERE b.medicine_id = ?
    GROUP BY b.id, b.medicine_id, b.lot_no, b.exp_date, b.created_at
    HAVING balance > 0
    ORDER BY b.exp_date ASC, b.created_at ASC, b.id ASC
    `,
    [medicineId]
  );
}

async function getMedicineLogsRaw(medicineId) {
  return await allAsync(
    `
    SELECT
      l.id,
      l.medicine_id,
      l.batch_id,
      l.type,
      l.amount,
      l.receiver,
      l.dispenser,
      l.remark,
      l.created_at,
      l.updated_at,
      b.lot_no,
      b.exp_date
    FROM logs l
    LEFT JOIN batches b ON b.id = l.batch_id
    WHERE l.medicine_id = ?
    ORDER BY datetime(l.created_at) ASC, l.id ASC
    `,
    [medicineId]
  );
}

async function getLogsWithBalance(medicineId) {
  const rows = await getMedicineLogsRaw(medicineId);
  let running = 0;

  const result = rows.map((row) => {
    running += row.type === "receive" ? Number(row.amount) : -Number(row.amount);
    return {
      ...row,
      balance_after: running,
    };
  });

  return result.reverse();
}

app.post("/api/admin/login", (req, res) => {
  const password = String(req.body.password || "");
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  }
  res.json({ token: ADMIN_TOKEN });
});

app.get("/api/admin/check", (req, res) => {
  const token = req.headers["x-admin-token"];
  res.json({ isAdmin: token === ADMIN_TOKEN });
});

app.get("/api/dashboard", async (req, res) => {
  try {
    const data = await getDashboard();
    res.json(data);
  } catch {
    res.status(500).json({ error: "โหลด dashboard ไม่สำเร็จ" });
  }
});

app.get("/api/dashboard/expiring", async (req, res) => {
  try {
    const rows = await allAsync(`
      SELECT
        m.id AS medicine_id,
        m.name AS medicine_name,
        b.id AS batch_id,
        b.lot_no,
        b.exp_date,
        COALESCE(SUM(CASE WHEN l.type='receive' THEN l.amount ELSE -l.amount END), 0) AS balance
      FROM batches b
      JOIN medicines m ON m.id = b.medicine_id
      LEFT JOIN logs l ON l.batch_id = b.id
      GROUP BY b.id, m.id, m.name, b.lot_no, b.exp_date
      HAVING balance > 0
      ORDER BY b.exp_date ASC, m.name ASC, b.lot_no ASC
    `);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const cutoff = new Date(now);
    cutoff.setMonth(cutoff.getMonth() + 6);

    const result = rows.filter((row) => {
      const exp = new Date(`${row.exp_date}T00:00:00`);
      return !Number.isNaN(exp.getTime()) && exp >= now && exp <= cutoff;
    });

    res.json(result);
  } catch {
    res.status(500).json({ error: "โหลดรายการยาใกล้หมดอายุไม่สำเร็จ" });
  }
});

app.get("/api/medicines", async (req, res) => {
  try {
    const rows = await listMedicinesWithBalance();
    res.json(rows);
  } catch {
    res.status(500).json({ error: "โหลดรายการยาไม่สำเร็จ" });
  }
});

app.post("/api/medicines", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name) {
      return res.status(400).json({ error: "กรุณากรอกชื่อยา" });
    }

    const result = await runAsync(
      `INSERT INTO medicines (name, created_at) VALUES (?, ?)`,
      [name, new Date().toISOString()]
    );

    res.json({ id: result.lastID, name });
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      return res.status(400).json({ error: "มียานี้อยู่แล้ว" });
    }
    res.status(500).json({ error: "เพิ่มยาไม่สำเร็จ" });
  }
});

app.delete("/api/medicines/:id", requireAdmin, async (req, res) => {
  try {
    const medicineId = Number(req.params.id);
    if (!medicineId) {
      return res.status(400).json({ error: "medicine id ไม่ถูกต้อง" });
    }

    const row = await getAsync(`SELECT COUNT(*) AS total FROM logs WHERE medicine_id = ?`, [medicineId]);
    if (Number(row.total) > 0) {
      return res.status(400).json({ error: "ลบไม่ได้ เพราะยังมีรายการใน Stock Card" });
    }

    await runAsync(`DELETE FROM medicines WHERE id = ?`, [medicineId]);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "ลบรายการยาไม่สำเร็จ" });
  }
});

app.get("/api/medicines/:id/logs", async (req, res) => {
  try {
    const medicineId = Number(req.params.id);
    if (!medicineId) {
      return res.status(400).json({ error: "medicine id ไม่ถูกต้อง" });
    }

    const rows = await getLogsWithBalance(medicineId);
    res.json(rows);
  } catch {
    res.status(500).json({ error: "โหลด Stock Card ไม่สำเร็จ" });
  }
});

app.post("/api/logs", async (req, res) => {
  try {
    const medicineId = Number(req.body.medicineId);
    const type = String(req.body.type || "").trim();
    const amount = Number(req.body.amount);
    const receiver = String(req.body.receiver || "").trim();
    const dispenser = String(req.body.dispenser || "").trim();
    const lotNo = String(req.body.lotNo || "").trim();
    const expDate = String(req.body.expDate || "").trim();

    if (!medicineId || !["receive", "dispense"].includes(type) || !amount || amount <= 0) {
      return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
    }

    const medicine = await getAsync(`SELECT * FROM medicines WHERE id = ?`, [medicineId]);
    if (!medicine) {
      return res.status(404).json({ error: "ไม่พบรายการยา" });
    }

    const createdAt = new Date().toISOString();

    if (type === "receive") {
      if (!lotNo) return res.status(400).json({ error: "กรุณากรอก Lot" });
      if (!expDate) return res.status(400).json({ error: "กรุณาเลือก Exp" });

      const batchResult = await runAsync(
        `
        INSERT INTO batches (medicine_id, lot_no, exp_date, created_at, updated_at)
        VALUES (?, ?, ?, ?, NULL)
        `,
        [medicineId, lotNo, expDate, createdAt]
      );

      await runAsync(
        `
        INSERT INTO logs
        (medicine_id, batch_id, type, amount, receiver, dispenser, remark, created_at, updated_at)
        VALUES (?, ?, 'receive', ?, ?, ?, '', ?, NULL)
        `,
        [medicineId, batchResult.lastID, amount, receiver, dispenser, createdAt]
      );

      return res.json({ success: true, batchId: batchResult.lastID });
    }

    const availableBatches = await getAvailableBatchesForMedicine(medicineId);
    const totalAvailable = availableBatches.reduce((sum, b) => sum + Number(b.balance), 0);

    if (totalAvailable < amount) {
      return res.status(400).json({ error: "จำนวนคงเหลือไม่พอ" });
    }

    let remain = amount;
    const allocations = [];

    for (const batch of availableBatches) {
      if (remain <= 0) break;

      const useQty = Math.min(remain, Number(batch.balance));
      if (useQty > 0) {
        allocations.push({
          batch_id: batch.id,
          lot_no: batch.lot_no,
          exp_date: batch.exp_date,
          amount: useQty,
        });
        remain -= useQty;
      }
    }

    if (remain > 0) {
      return res.status(400).json({ error: "ไม่สามารถจัดล็อตสำหรับการจ่ายออกได้" });
    }

    const remark = allocations.length > 1 ? "จ่ายออกอัตโนมัติตาม FEFO" : "";

    for (const item of allocations) {
      await runAsync(
        `
        INSERT INTO logs
        (medicine_id, batch_id, type, amount, receiver, dispenser, remark, created_at, updated_at)
        VALUES (?, ?, 'dispense', ?, ?, ?, ?, ?, NULL)
        `,
        [medicineId, item.batch_id, item.amount, receiver, dispenser, remark, createdAt]
      );
    }

    res.json({ success: true, allocations });
  } catch {
    res.status(500).json({ error: "บันทึกรายการไม่สำเร็จ" });
  }
});

app.put("/api/logs/:id", async (req, res) => {
  try {
    const logId = Number(req.params.id);
    const amount = Number(req.body.amount);
    const remark = String(req.body.remark || "").trim();
    const lotNo = typeof req.body.lotNo === "string" ? req.body.lotNo.trim() : undefined;
    const expDate = typeof req.body.expDate === "string" ? req.body.expDate.trim() : undefined;

    if (!logId || !amount || amount <= 0) {
      return res.status(400).json({ error: "จำนวนไม่ถูกต้อง" });
    }
    if (!remark) {
      return res.status(400).json({ error: "กรุณากรอกหมายเหตุการแก้ไข" });
    }

    const targetLog = await getAsync(`SELECT * FROM logs WHERE id = ?`, [logId]);
    if (!targetLog) {
      return res.status(404).json({ error: "ไม่พบรายการ" });
    }

    const isAdmin = isAdminRequest(req);

    if (targetLog.type === "receive") {
      if (!isAdmin) {
        return res.status(403).json({ error: "เฉพาะผู้ดูแลเท่านั้นที่แก้รายการรับเข้า / Lot / Exp ได้" });
      }

      const dispensed = await getBatchDispensedAmount(targetLog.batch_id);
      if (amount < dispensed) {
        return res.status(400).json({
          error: `แก้ไม่ได้ เพราะล็อตนี้ถูกจ่ายออกไปแล้ว ${dispensed} หน่วย`,
        });
      }

      if (!lotNo || !expDate) {
        return res.status(400).json({ error: "รายการรับเข้าต้องมี Lot และ Exp" });
      }

      const newRemark = targetLog.remark
        ? `${targetLog.remark} | แก้ไข: ${remark}`
        : `แก้ไข: ${remark}`;

      await runAsync(
        `UPDATE logs SET amount = ?, remark = ?, updated_at = ? WHERE id = ?`,
        [amount, newRemark, new Date().toISOString(), logId]
      );

      await runAsync(
        `UPDATE batches SET lot_no = ?, exp_date = ?, updated_at = ? WHERE id = ?`,
        [lotNo, expDate, new Date().toISOString(), targetLog.batch_id]
      );

      return res.json({ success: true });
    }

    if (targetLog.type === "dispense") {
      const received = await getBatchReceivedAmount(targetLog.batch_id);
      const dispensedOther = await getBatchDispensedAmount(targetLog.batch_id, logId);

      if (amount + dispensedOther > received) {
        return res.status(400).json({
          error: "แก้ไม่ได้ เพราะจะทำให้ล็อตนี้ติดลบ",
        });
      }

      const newRemark = targetLog.remark
        ? `${targetLog.remark} | แก้ไข: ${remark}`
        : `แก้ไข: ${remark}`;

      await runAsync(
        `UPDATE logs SET amount = ?, remark = ?, updated_at = ? WHERE id = ?`,
        [amount, newRemark, new Date().toISOString(), logId]
      );

      return res.json({ success: true });
    }

    res.status(400).json({ error: "ประเภท log ไม่ถูกต้อง" });
  } catch {
    res.status(500).json({ error: "แก้ไขรายการไม่สำเร็จ" });
  }
});

app.delete("/api/logs/:id", requireAdmin, async (req, res) => {
  try {
    const logId = Number(req.params.id);
    if (!logId) {
      return res.status(400).json({ error: "log id ไม่ถูกต้อง" });
    }

    const targetLog = await getAsync(`SELECT * FROM logs WHERE id = ?`, [logId]);
    if (!targetLog) {
      return res.status(404).json({ error: "ไม่พบรายการ" });
    }

    if (targetLog.type === "receive") {
      const row = await getAsync(
        `SELECT COUNT(*) AS total FROM logs WHERE batch_id = ? AND type = 'dispense'`,
        [targetLog.batch_id]
      );

      if (Number(row.total) > 0) {
        return res.status(400).json({
          error: "ลบไม่ได้ เพราะล็อตนี้มีรายการจ่ายออกแล้ว",
        });
      }

      await runAsync(`DELETE FROM logs WHERE id = ?`, [logId]);
      await runAsync(`DELETE FROM batches WHERE id = ?`, [targetLog.batch_id]);

      return res.json({ success: true });
    }

    if (targetLog.type === "dispense") {
      await runAsync(`DELETE FROM logs WHERE id = ?`, [logId]);
      return res.json({ success: true });
    }

    res.status(400).json({ error: "ประเภท log ไม่ถูกต้อง" });
  } catch {
    res.status(500).json({ error: "ลบรายการไม่สำเร็จ" });
  }
});

initDb()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running at http://0.0.0.0:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Init DB failed:", err);
  });