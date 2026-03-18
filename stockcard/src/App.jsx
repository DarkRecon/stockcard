import React, { useEffect, useMemo, useState } from "react";

const API_BASE = `http://${window.location.hostname}:3000`;

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString("th-TH") : "-";
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH");
}

function getTypeLabel(type) {
  return type === "receive" ? "รับเข้า" : "จ่ายออก";
}

function parseDisplayDateToIso(displayDate) {
  const value = String(displayDate || "").trim();
  const match = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const test = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(test.getTime())) return "";
  return iso;
}

function isoToDisplayDate(isoDate) {
  if (!isoDate) return "";
  const [yyyy, mm, dd] = String(isoDate).split("-");
  if (!yyyy || !mm || !dd) return "";
  return `${dd}/${mm}/${yyyy}`;
}

function autoFormatDateInput(value) {
  let raw = String(value || "").replace(/[^0-9]/g, "");

  if (raw.length >= 3 && raw.length <= 4) {
    raw = raw.slice(0, 2) + "/" + raw.slice(2);
  } else if (raw.length > 4) {
    raw = raw.slice(0, 2) + "/" + raw.slice(2, 4) + "/" + raw.slice(4, 8);
  }

  return raw;
}

function SectionTitle({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#0f172a" }}>{title}</h2>
      <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>{subtitle}</p>
    </div>
  );
}

function StatCard({ title, value, subtitle }) {
  return (
    <div style={statCardStyle}>
      <div style={statTitleStyle}>{title}</div>
      <div style={statValueStyle}>{value}</div>
      <div style={statSubtitleStyle}>{subtitle}</div>
    </div>
  );
}

export default function App() {
  const [medicines, setMedicines] = useState([]);
  const [dashboard, setDashboard] = useState({
    medicineCount: 0,
    expiringSoonCount: 0,
  });
  const [expiringSoonItems, setExpiringSoonItems] = useState([]);

  const [openedMedicineId, setOpenedMedicineId] = useState("");
  const [openedLogs, setOpenedLogs] = useState([]);

  const [medicineName, setMedicineName] = useState("");
  const [selectedMedicineId, setSelectedMedicineId] = useState("");
  const [actionType, setActionType] = useState("receive");
  const [amount, setAmount] = useState("");
  const [receiver, setReceiver] = useState("");
  const [dispenser, setDispenser] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [expDate, setExpDate] = useState("");

  const [editId, setEditId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editLotNo, setEditLotNo] = useState("");
  const [editExpDate, setEditExpDate] = useState("");
  const [editRemark, setEditRemark] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");

  const [search, setSearch] = useState("");

  const [stockCardFilterDate, setStockCardFilterDate] = useState("");
  const [stockCardFilterDisplay, setStockCardFilterDisplay] = useState("");

  const openedMedicine = useMemo(
    () => medicines.find((m) => String(m.id) === String(openedMedicineId)) || null,
    [medicines, openedMedicineId]
  );

  const displayedStockCardLogs = useMemo(() => {
    if (!stockCardFilterDate) return openedLogs;

    return openedLogs.filter((log) => {
      const value = String(log.created_at || "").slice(0, 10);
      return value === stockCardFilterDate;
    });
  }, [openedLogs, stockCardFilterDate]);

  const filteredMedicines = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return medicines;
    return medicines.filter((m) => String(m.name || "").toLowerCase().includes(q));
  }, [medicines, search]);

  useEffect(() => {
    boot();
  }, []);

  async function api(path, options = {}) {
    const token = localStorage.getItem("stockcard_admin_token") || "";
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    if (token) {
      headers["x-admin-token"] = token;
    }

    const res = await fetch(`${API_BASE}${path}`, {
      headers,
      ...options,
    });

    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    if (!res.ok) {
      throw new Error(typeof data === "string" ? data : data.error || "เกิดข้อผิดพลาด");
    }

    return data;
  }

  async function boot() {
    await Promise.all([
      loadMedicines(),
      checkAdminSession(),
      loadDashboard(),
      loadExpiringSoonItems(),
    ]);
  }

  async function loadDashboard() {
    try {
      const data = await api("/api/dashboard");
      setDashboard(data);
    } catch {}
  }

  async function loadExpiringSoonItems() {
    try {
      const data = await api("/api/dashboard/expiring");
      setExpiringSoonItems(data);
    } catch {
      setExpiringSoonItems([]);
    }
  }

  async function checkAdminSession() {
    try {
      const result = await api("/api/admin/check");
      setIsAdmin(Boolean(result.isAdmin));
    } catch {
      setIsAdmin(false);
    }
  }

  async function loadMedicines() {
    try {
      setLoading(true);
      const data = await api("/api/medicines");
      setMedicines(data);
      if (!selectedMedicineId && data.length > 0) {
        setSelectedMedicineId(String(data[0].id));
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function reloadAll() {
    await Promise.all([
      loadMedicines(),
      loadDashboard(),
      loadExpiringSoonItems(),
    ]);
  }

  async function openStockCard(medicineId) {
    try {
      setLoading(true);
      const data = await api(`/api/medicines/${medicineId}/logs`);
      setOpenedMedicineId(String(medicineId));
      setOpenedLogs(data);
      setStockCardFilterDate("");
      setStockCardFilterDisplay("");
      cancelEdit();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAdminLogin(e) {
    e.preventDefault();
    if (!adminPassword.trim()) return;

    try {
      setLoading(true);
      const result = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: adminPassword }),
      });
      localStorage.setItem("stockcard_admin_token", result.token);
      setIsAdmin(true);
      setShowAdminLogin(false);
      setShowAdminPanel(true);
      setAdminPassword("");
      setMessage("เข้าสู่หลังบ้านสำเร็จ");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleAdminLogout() {
    localStorage.removeItem("stockcard_admin_token");
    setIsAdmin(false);
    setShowAdminPanel(false);
    setShowAdminLogin(false);
    setAdminPassword("");
    setMessage("ออกจากหลังบ้านแล้ว");
  }

  async function handleAddMedicine(e) {
    e.preventDefault();
    const name = medicineName.trim();
    if (!name) return;

    try {
      setLoading(true);
      await api("/api/medicines", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      setMedicineName("");
      setMessage("เพิ่มยาเรียบร้อย");
      await reloadAll();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteMedicine(medicineId) {
    if (!window.confirm("ต้องการลบรายการยานี้ใช่หรือไม่")) return;

    try {
      setLoading(true);
      await api(`/api/medicines/${medicineId}`, {
        method: "DELETE",
      });

      if (String(openedMedicineId) === String(medicineId)) {
        setOpenedMedicineId("");
        setOpenedLogs([]);
      }

      setMessage("ลบรายการยาเรียบร้อย");
      await reloadAll();
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAddLog(e) {
    e.preventDefault();
    const qty = Number(amount);
    if (!selectedMedicineId || !qty || qty <= 0) return;

    const expDateIso = parseDisplayDateToIso(expDate);

    if (actionType === "receive") {
      if (!lotNo.trim()) {
        alert("กรุณากรอก Lot");
        return;
      }
      if (!expDate.trim()) {
        alert("กรุณากรอก Exp");
        return;
      }
      if (!expDateIso) {
        alert("รูปแบบ Exp ต้องเป็น dd/mm/yyyy เช่น 31/12/2026");
        return;
      }
    }

    try {
      setLoading(true);

      const result = await api("/api/logs", {
        method: "POST",
        body: JSON.stringify({
          medicineId: Number(selectedMedicineId),
          type: actionType,
          amount: qty,
          receiver: receiver.trim(),
          dispenser: dispenser.trim(),
          lotNo: lotNo.trim(),
          expDate: expDateIso,
        }),
      });

      setAmount("");
      setReceiver("");
      setDispenser("");
      setLotNo("");
      setExpDate("");

      if (actionType === "dispense" && result.allocations?.length > 0) {
        const text = result.allocations
          .map((x) => `${x.lot_no} (${x.exp_date}) = ${x.amount}`)
          .join(", ");
        setMessage(`บันทึกจ่ายออกเรียบร้อย ตัดตาม FEFO: ${text}`);
      } else {
        setMessage(actionType === "receive" ? "บันทึกรับเข้าเรียบร้อย" : "บันทึกจ่ายออกเรียบร้อย");
      }

      await reloadAll();
      if (openedMedicineId === String(selectedMedicineId)) {
        await openStockCard(selectedMedicineId);
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(log) {
    setEditId(String(log.id));
    setEditAmount(String(log.amount));
    setEditLotNo(log.lot_no || "");
    setEditExpDate(isoToDisplayDate(log.exp_date || ""));
    setEditRemark("");
  }

  function cancelEdit() {
    setEditId("");
    setEditAmount("");
    setEditLotNo("");
    setEditExpDate("");
    setEditRemark("");
  }

  async function saveEdit(log) {
    const qty = Number(editAmount);
    const remark = editRemark.trim();
    const expDateIso = parseDisplayDateToIso(editExpDate);

    if (!qty || qty <= 0) {
      alert("กรอกจำนวนให้ถูกต้อง");
      return;
    }
    if (!remark) {
      alert("กรุณากรอกหมายเหตุการแก้ไข");
      return;
    }

    if (log.type === "receive") {
      if (!editLotNo.trim()) {
        alert("กรุณากรอก Lot");
        return;
      }
      if (!editExpDate.trim() || !expDateIso) {
        alert("กรุณากรอก Exp ให้ถูกต้องเป็น dd/mm/yyyy");
        return;
      }
    }

    try {
      setLoading(true);
      await api(`/api/logs/${log.id}`, {
        method: "PUT",
        body: JSON.stringify({
          amount: qty,
          remark,
          lotNo: log.type === "receive" ? editLotNo.trim() : undefined,
          expDate: log.type === "receive" ? expDateIso : undefined,
        }),
      });

      cancelEdit();
      setMessage("แก้ไขรายการเรียบร้อย");
      await reloadAll();
      await openStockCard(log.medicine_id);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteLog(logId, medicineId) {
    if (!window.confirm("ต้องการลบรายการนี้ใช่หรือไม่")) return;

    try {
      setLoading(true);
      await api(`/api/logs/${logId}`, {
        method: "DELETE",
      });
      setMessage("ลบรายการเรียบร้อย");
      await reloadAll();
      await openStockCard(medicineId);
    } catch (err) {
      setMessage(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={pageStyle}>
      <div style={bgGlowOne} />
      <div style={bgGlowTwo} />

      <div style={{ maxWidth: 1220, margin: "0 auto", position: "relative", zIndex: 1 }}>
        <div style={heroStyle}>
          <div>
            <div style={brandPill}>STOCK CARD SYSTEM</div>
            <h1 style={heroTitle}>ระบบ Stock Card</h1>
            <p style={heroSubtitle}>
              จัดทำโดย DrNeet
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {!isAdmin ? (
              <button style={primaryButtonStyle} type="button" onClick={() => setShowAdminLogin(true)}>
                เข้าหลังบ้าน
              </button>
            ) : (
              <>
                <button style={primaryButtonStyle} type="button" onClick={() => setShowAdminPanel(true)}>
                  เปิดหลังบ้าน
                </button>
                <button style={secondaryButtonStyle} type="button" onClick={handleAdminLogout}>
                  ออกจากหลังบ้าน
                </button>
              </>
            )}
          </div>
        </div>

        {message && <div style={messageStyle}>{message}</div>}

        <div style={statsGridStyle}>
          <StatCard title="รายการยา" value={dashboard.medicineCount} subtitle="จำนวนยาทั้งหมดในระบบ" />
          <StatCard title="ใกล้หมดอายุ" value={dashboard.expiringSoonCount} subtitle="ล็อตที่หมดภายใน 6 เดือน" />
          <StatCard
            title="สถานะผู้ใช้งาน"
            value={isAdmin ? "Admin" : "User"}
            subtitle={isAdmin ? "จัดการข้อมูลได้เต็มรูปแบบ" : "ใช้งานทั่วไป"}
          />
        </div>

        <div style={{ ...glassCardStyle, marginBottom: 20 }}>
          <SectionTitle
            title="รายการยาใกล้หมดอายุ"
            subtitle="แสดงล็อตที่หมดอายุภายใน 6 เดือน"
          />

          {expiringSoonItems.length === 0 ? (
            <div style={emptyStateStyle}>ยังไม่มีรายการที่ใกล้หมดอายุภายใน 6 เดือน</div>
          ) : (
            <div style={medicineListStyle}>
              {expiringSoonItems.map((item) => (
                <div key={item.batch_id} style={medicineRowStyle}>
                  <div>
                    <div style={medicineNameStyle}>{item.medicine_name}</div>
                    <div style={medicineMetaStyle}>
                      LOT: {item.lot_no} | EXP: {formatDate(item.exp_date)} | คงเหลือ: {item.balance}
                    </div>
                  </div>
                  <button
                    style={smallButtonStyle}
                    type="button"
                    onClick={() => openStockCard(item.medicine_id)}
                  >
                    เปิด Stock Card
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={mainGridStyle}>
          <div style={glassCardStyle}>
            <SectionTitle
              title="บันทึกรับ / จ่ายออก"
              // subtitle="รับเข้าต้องระบุ Lot และ Exp เป็น dd/mm/yyyy (ค.ศ.)"
            />

            <form onSubmit={handleAddLog}>
              <label style={labelStyle}>เลือกรายการยา</label>
              <select
                style={inputStyle}
                value={selectedMedicineId}
                onChange={(e) => setSelectedMedicineId(e.target.value)}
              >
                <option value="">-- เลือกยา --</option>
                {medicines.map((medicine) => (
                  <option key={medicine.id} value={medicine.id}>
                    {medicine.name}
                  </option>
                ))}
              </select>

              <label style={labelStyle}>ประเภท</label>
              <select
                style={inputStyle}
                value={actionType}
                onChange={(e) => setActionType(e.target.value)}
              >
                <option value="receive">รับเข้า</option>
                <option value="dispense">จ่ายออก</option>
              </select>

              <label style={labelStyle}>จำนวน</label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                placeholder="กรอกจำนวน"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />

              {actionType === "receive" && (
                <div style={twoColStyle}>
                  <div>
                    <label style={labelStyle}>Lot</label>
                    <input
                      style={inputStyle}
                      placeholder="กรอกเลข Lot"
                      value={lotNo}
                      onChange={(e) => setLotNo(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Exp (dd/mm/yyyy ค.ศ.)</label>
                    <input
                      style={inputStyle}
                      type="text"
                      inputMode="numeric"
                      placeholder="เช่น 31/12/2026"
                      value={expDate}
                      onChange={(e) => setExpDate(autoFormatDateInput(e.target.value))}
                    />
                  </div>
                </div>
              )}

              <div style={twoColStyle}>
                <div>
                  <label style={labelStyle}>ผู้จัด</label>
                  <input
                    style={inputStyle}
                    placeholder="ชื่อผู้จัด"
                    value={receiver}
                    onChange={(e) => setReceiver(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>ผู้จ่าย</label>
                  <input
                    style={inputStyle}
                    placeholder="ชื่อผู้จ่าย"
                    value={dispenser}
                    onChange={(e) => setDispenser(e.target.value)}
                  />
                </div>
              </div>

              {actionType === "dispense" && (
                <div style={hintBoxStyle}>
                  ตอนจ่ายออก ระบบจะตัดจากล็อตที่ Exp ใกล้หมดก่อนอัตโนมัติ
                </div>
              )}

              <button style={primaryButtonStyle} type="submit" disabled={loading}>
                {loading ? "กำลังบันทึก..." : "บันทึกรายการ"}
              </button>
            </form>
          </div>

          <div style={glassCardStyle}>
            <SectionTitle title="รายการยา" subtitle="คลิกเพื่อเปิด Stock Card ของแต่ละรายการ" />

            <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
              <input
                style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 220 }}
                placeholder="ค้นหาชื่อยา"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <button style={secondaryButtonStyle} type="button" onClick={reloadAll}>
                รีเฟรช
              </button>
            </div>

            <div style={medicineListStyle}>
              {filteredMedicines.length === 0 ? (
                <div style={emptyStateStyle}>ยังไม่มีข้อมูลยา</div>
              ) : (
                filteredMedicines.map((medicine) => (
                  <div key={medicine.id} style={medicineRowStyle}>
                    <div>
                      <div style={medicineNameStyle}>{medicine.name}</div>
                      <div style={medicineMetaStyle}>คงเหลือ {medicine.balance}</div>
                    </div>
                    <button
                      style={smallButtonStyle}
                      type="button"
                      onClick={() => openStockCard(medicine.id)}
                    >
                      เปิด Stock Card
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {showAdminLogin && (
          <div style={overlayStyle} onClick={() => setShowAdminLogin(false)}>
            <div style={modalSmallStyle} onClick={(e) => e.stopPropagation()}>
              <SectionTitle title="เข้าสู่หลังบ้าน" subtitle="เฉพาะผู้ดูแลที่มีรหัสผ่าน" />
              <form onSubmit={handleAdminLogin}>
                <label style={labelStyle}>รหัสผ่านผู้ดูแล</label>
                <input
                  style={inputStyle}
                  type="password"
                  placeholder="กรอกรหัสผ่าน"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                />
                <div style={{ display: "flex", gap: 10 }}>
                  <button style={primaryButtonStyle} type="submit" disabled={loading}>
                    เข้าสู่ระบบ
                  </button>
                  <button
                    style={secondaryButtonStyle}
                    type="button"
                    onClick={() => setShowAdminLogin(false)}
                  >
                    ยกเลิก
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {showAdminPanel && isAdmin && (
          <div style={overlayStyle} onClick={() => setShowAdminPanel(false)}>
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
              <div style={modalHeaderStyle}>
                <SectionTitle title="หลังบ้าน" subtitle="เพิ่มหรือลบรายการยาได้จากส่วนนี้" />
                <button
                  style={secondaryButtonStyle}
                  type="button"
                  onClick={() => setShowAdminPanel(false)}
                >
                  ปิด
                </button>
              </div>

              <div style={adminPanelGridStyle}>
                <div style={innerPanelStyle}>
                  <h3 style={innerTitleStyle}>เพิ่มรายการยา</h3>
                  <form onSubmit={handleAddMedicine}>
                    <label style={labelStyle}>ชื่อยา</label>
                    <input
                      style={inputStyle}
                      placeholder="กรอกชื่อยาใหม่"
                      value={medicineName}
                      onChange={(e) => setMedicineName(e.target.value)}
                    />
                    <button style={primaryButtonStyle} type="submit" disabled={loading}>
                      เพิ่มยา
                    </button>
                  </form>
                </div>

                <div style={innerPanelStyle}>
                  <h3 style={innerTitleStyle}>ลบรายการยา</h3>
                  <div style={medicineListStyle}>
                    {medicines.map((medicine) => (
                      <div key={medicine.id} style={medicineRowStyle}>
                        <div>
                          <div style={medicineNameStyle}>{medicine.name}</div>
                          <div style={medicineMetaStyle}>คงเหลือ {medicine.balance}</div>
                        </div>
                        <button
                          style={dangerButtonStyle}
                          type="button"
                          onClick={() => handleDeleteMedicine(medicine.id)}
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {openedMedicine && (
          <div
            style={overlayStyle}
            onClick={() => {
              setOpenedMedicineId("");
              setOpenedLogs([]);
              setStockCardFilterDate("");
              setStockCardFilterDisplay("");
              cancelEdit();
            }}
          >
            <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
              <div style={modalHeaderStyle}>
                <div>
                  <div style={stockCardLabelStyle}>STOCK CARD</div>
                  <h2 style={{ margin: "4px 0 6px", fontSize: 28 }}>{openedMedicine.name}</h2>
                  <div style={medicineMetaStyle}>ประวัติการเคลื่อนไหว, Lot, Exp และยอดคงเหลือ</div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    style={{ ...inputStyle, marginBottom: 0, width: 180 }}
                    type="text"
                    placeholder="dd/mm/yyyy"
                    value={stockCardFilterDisplay}
                    onChange={(e) => {
                      const formatted = autoFormatDateInput(e.target.value);
                      setStockCardFilterDisplay(formatted);

                      const iso = parseDisplayDateToIso(formatted);
                      if (iso) {
                        setStockCardFilterDate(iso);
                      } else if (!formatted) {
                        setStockCardFilterDate("");
                      }
                    }}
                  />

                  {stockCardFilterDisplay && (
                    <button
                      style={secondaryButtonStyle}
                      type="button"
                      onClick={() => {
                        setStockCardFilterDisplay("");
                        setStockCardFilterDate("");
                      }}
                    >
                      ล้างวันที่
                    </button>
                  )}

                  <button
                    style={smallButtonStyle}
                    type="button"
                    onClick={() => openStockCard(openedMedicine.id)}
                  >
                    รีเฟรช
                  </button>

                  <button
                    style={secondaryButtonStyle}
                    type="button"
                    onClick={() => {
                      setOpenedMedicineId("");
                      setOpenedLogs([]);
                      setStockCardFilterDate("");
                      setStockCardFilterDisplay("");
                      cancelEdit();
                    }}
                  >
                    ปิด
                  </button>
                </div>
              </div>

              <div style={tableWrapStyle}>
                <table style={tableStyle}>
                  <thead>
                    <tr>
                      <th style={thStyle}>วันเวลา</th>
                      <th style={thStyle}>ประเภท</th>
                      <th style={thStyle}>จำนวน</th>
                      <th style={thStyle}>Lot</th>
                      <th style={thStyle}>Exp</th>
                      <th style={thStyle}>ผู้จัด</th>
                      <th style={thStyle}>ผู้จ่าย</th>
                      <th style={thStyle}>คงเหลือ</th>
                      <th style={thStyle}>หมายเหตุ</th>
                      <th style={thStyle}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedStockCardLogs.length === 0 ? (
                      <tr>
                        <td style={tdStyle} colSpan="10">
                          ยังไม่มีรายการในวันที่เลือก
                        </td>
                      </tr>
                    ) : (
                      displayedStockCardLogs.map((log) => (
                        <tr key={log.id} style={rowHoverStyle}>
                          <td style={tdStyle}>{formatDateTime(log.created_at)}</td>

                          <td style={tdStyle}>
                            <span style={log.type === "receive" ? typeReceiveStyle : typeDispenseStyle}>
                              {getTypeLabel(log.type)}
                            </span>
                          </td>

                          <td style={tdStyle}>
                            {editId === String(log.id) ? (
                              <input
                                style={{ ...inputStyle, margin: 0, minWidth: 90 }}
                                type="number"
                                min="1"
                                value={editAmount}
                                onChange={(e) => setEditAmount(e.target.value)}
                              />
                            ) : (
                              <span style={{ fontWeight: 700 }}>{log.amount}</span>
                            )}
                          </td>

                          <td style={tdStyle}>
                            {editId === String(log.id) && log.type === "receive" ? (
                              <input
                                style={{ ...inputStyle, margin: 0, minWidth: 140 }}
                                value={editLotNo}
                                onChange={(e) => setEditLotNo(e.target.value)}
                              />
                            ) : (
                              log.lot_no || "-"
                            )}
                          </td>

                          <td style={tdStyle}>
                            {editId === String(log.id) && log.type === "receive" ? (
                              <input
                                style={{ ...inputStyle, margin: 0, minWidth: 140 }}
                                type="text"
                                inputMode="numeric"
                                placeholder="dd/mm/yyyy"
                                value={editExpDate}
                                onChange={(e) => setEditExpDate(autoFormatDateInput(e.target.value))}
                              />
                            ) : (
                              formatDate(log.exp_date)
                            )}
                          </td>

                          <td style={tdStyle}>{log.receiver || "-"}</td>
                          <td style={tdStyle}>{log.dispenser || "-"}</td>
                          <td style={tdStyle}>
                            <span style={balancePillStyle}>{log.balance_after}</span>
                          </td>

                          <td style={tdStyle}>
                            {editId === String(log.id) ? (
                              <input
                                style={{ ...inputStyle, margin: 0, minWidth: 220 }}
                                placeholder="เช่น แก้ Lot/Exp ที่บันทึกผิด"
                                value={editRemark}
                                onChange={(e) => setEditRemark(e.target.value)}
                              />
                            ) : (
                              log.remark || "-"
                            )}
                          </td>

                          <td style={tdStyle}>
                            {editId === String(log.id) ? (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                <button style={smallButtonStyle} onClick={() => saveEdit(log)} type="button">
                                  บันทึก
                                </button>
                                <button style={secondaryButtonStyle} onClick={cancelEdit} type="button">
                                  ยกเลิก
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                {(isAdmin || log.type === "dispense") && (
                                  <button
                                    style={smallButtonStyle}
                                    onClick={() => startEdit(log)}
                                    type="button"
                                  >
                                    แก้ไข
                                  </button>
                                )}
                                {isAdmin && (
                                  <button
                                    style={dangerButtonStyle}
                                    onClick={() => handleDeleteLog(log.id, log.medicine_id)}
                                    type="button"
                                  >
                                    ลบ
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const pageStyle = {
  minHeight: "100vh",
  padding: 24,
  fontFamily: "Inter, Arial, sans-serif",
  background: "linear-gradient(180deg, #eef4ff 0%, #f8fbff 52%, #f3f6fb 100%)",
  position: "relative",
  overflow: "hidden",
};

const bgGlowOne = {
  position: "absolute",
  width: 420,
  height: 420,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0) 70%)",
  top: -120,
  left: -100,
  pointerEvents: "none",
};

const bgGlowTwo = {
  position: "absolute",
  width: 480,
  height: 480,
  borderRadius: "50%",
  background: "radial-gradient(circle, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0) 70%)",
  right: -140,
  top: 80,
  pointerEvents: "none",
};

const heroStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  marginBottom: 20,
  background: "rgba(255,255,255,0.72)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 16px 50px rgba(15,23,42,0.08)",
  borderRadius: 28,
  padding: 28,
  flexWrap: "wrap",
};

const brandPill = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 999,
  background: "linear-gradient(90deg, #dbeafe 0%, #dcfce7 100%)",
  color: "#1e3a8a",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  marginBottom: 12,
};

const heroTitle = {
  margin: 0,
  fontSize: 38,
  lineHeight: 1.1,
  fontWeight: 900,
  color: "#0f172a",
};

const heroSubtitle = {
  margin: "12px 0 0",
  color: "#475569",
  maxWidth: 650,
  fontSize: 15,
  lineHeight: 1.6,
};

const statsGridStyle = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 16,
  marginBottom: 20,
};

const statCardStyle = {
  background: "rgba(255,255,255,0.74)",
  backdropFilter: "blur(12px)",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 16px 40px rgba(15,23,42,0.06)",
  padding: 22,
};

const statTitleStyle = {
  color: "#64748b",
  fontSize: 14,
  fontWeight: 700,
};

const statValueStyle = {
  color: "#0f172a",
  fontSize: 34,
  fontWeight: 900,
  marginTop: 10,
};

const statSubtitleStyle = {
  color: "#64748b",
  fontSize: 13,
  marginTop: 6,
};

const mainGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(320px, 420px) minmax(0, 1fr)",
  gap: 20,
  alignItems: "start",
};

const glassCardStyle = {
  background: "rgba(255,255,255,0.78)",
  backdropFilter: "blur(16px)",
  borderRadius: 28,
  border: "1px solid rgba(255,255,255,0.7)",
  boxShadow: "0 18px 50px rgba(15,23,42,0.07)",
  padding: 24,
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  color: "#334155",
  fontWeight: 700,
  fontSize: 14,
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  marginBottom: 14,
  border: "1px solid #dbe3f0",
  borderRadius: 16,
  boxSizing: "border-box",
  fontSize: 14,
  outline: "none",
  background: "rgba(255,255,255,0.95)",
  color: "#0f172a",
};

const primaryButtonStyle = {
  background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
  color: "white",
  border: 0,
  padding: "12px 18px",
  borderRadius: 16,
  cursor: "pointer",
  fontWeight: 800,
  boxShadow: "0 12px 24px rgba(37,99,235,0.28)",
};

const secondaryButtonStyle = {
  background: "#ffffff",
  color: "#334155",
  border: "1px solid #dbe3f0",
  padding: "12px 18px",
  borderRadius: 16,
  cursor: "pointer",
  fontWeight: 700,
};

const smallButtonStyle = {
  background: "linear-gradient(135deg, #0f172a 0%, #334155 100%)",
  color: "white",
  border: 0,
  padding: "10px 14px",
  borderRadius: 14,
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const dangerButtonStyle = {
  background: "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)",
  color: "white",
  border: 0,
  padding: "10px 14px",
  borderRadius: 14,
  cursor: "pointer",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const twoColStyle = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const medicineListStyle = {
  display: "flex",
  flexDirection: "column",
  gap: 12,
  maxHeight: 560,
  overflow: "auto",
  paddingRight: 4,
};

const medicineRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: 16,
  borderRadius: 20,
  background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
  border: "1px solid #e7eef8",
  boxShadow: "0 10px 24px rgba(15,23,42,0.04)",
};

const medicineNameStyle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0f172a",
};

const medicineMetaStyle = {
  color: "#64748b",
  fontSize: 13,
  marginTop: 4,
};

const emptyStateStyle = {
  padding: 24,
  borderRadius: 20,
  textAlign: "center",
  color: "#64748b",
  background: "#f8fbff",
  border: "1px dashed #cbd5e1",
};

const hintBoxStyle = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 16,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 13,
  fontWeight: 700,
  border: "1px solid #bfdbfe",
};

const messageStyle = {
  background: "linear-gradient(90deg, #dbeafe 0%, #dcfce7 100%)",
  color: "#0f172a",
  padding: 14,
  borderRadius: 18,
  marginBottom: 16,
  fontWeight: 700,
  border: "1px solid rgba(255,255,255,0.7)",
};

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(15,23,42,0.42)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
  zIndex: 50,
};

const modalStyle = {
  width: "100%",
  maxWidth: 1180,
  maxHeight: "88vh",
  overflow: "auto",
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(16px)",
  borderRadius: 30,
  padding: 24,
  boxShadow: "0 28px 80px rgba(15,23,42,0.24)",
  border: "1px solid rgba(255,255,255,0.7)",
};

const modalSmallStyle = {
  width: "100%",
  maxWidth: 440,
  background: "rgba(255,255,255,0.96)",
  borderRadius: 28,
  padding: 24,
  boxShadow: "0 28px 80px rgba(15,23,42,0.22)",
  border: "1px solid rgba(255,255,255,0.7)",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  marginBottom: 18,
  flexWrap: "wrap",
};

const adminPanelGridStyle = {
  display: "grid",
  gridTemplateColumns: "minmax(280px, 380px) minmax(0, 1fr)",
  gap: 16,
};

const innerPanelStyle = {
  background: "rgba(255,255,255,0.84)",
  border: "1px solid #e7eef8",
  borderRadius: 24,
  padding: 18,
};

const innerTitleStyle = {
  marginTop: 0,
  marginBottom: 16,
  fontSize: 18,
  color: "#0f172a",
};

const tableWrapStyle = {
  overflowX: "auto",
  borderRadius: 22,
  border: "1px solid #e7eef8",
  background: "#ffffff",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thStyle = {
  textAlign: "left",
  padding: 14,
  borderBottom: "1px solid #e7eef8",
  background: "#f8fbff",
  color: "#334155",
  fontSize: 13,
  fontWeight: 800,
  position: "sticky",
  top: 0,
};

const tdStyle = {
  padding: 14,
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  color: "#0f172a",
  fontSize: 14,
};

const rowHoverStyle = {
  background: "#ffffff",
};

const typeReceiveStyle = {
  display: "inline-block",
  padding: "7px 12px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: 800,
  fontSize: 12,
};

const typeDispenseStyle = {
  display: "inline-block",
  padding: "7px 12px",
  borderRadius: 999,
  background: "#fee2e2",
  color: "#991b1b",
  fontWeight: 800,
  fontSize: 12,
};

const balancePillStyle = {
  display: "inline-block",
  padding: "7px 12px",
  borderRadius: 999,
  background: "#eff6ff",
  color: "#1d4ed8",
  fontWeight: 800,
};

const stockCardLabelStyle = {
  display: "inline-block",
  padding: "8px 12px",
  borderRadius: 999,
  background: "linear-gradient(90deg, #dbeafe 0%, #ede9fe 100%)",
  color: "#312e81",
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 0.6,
};