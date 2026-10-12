import React, { useEffect, useMemo, useState } from "react";
import "./dashboard.css";
import "./my_profile.css";

function getOwnerStorageKey() {
  // Prefer the signed-in JWT identity. Old user objects can remain in localStorage
  // after logout and must not select another account's dashboard storage.
  const token =
    localStorage.getItem("smartstay_token") ||
    localStorage.getItem("accessToken") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwtToken") ||
    localStorage.getItem("token") ||
    "";

  try {
    const part = token.split(".")[1];
    if (part) {
      const base64 = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
      const payload = JSON.parse(atob(padded));
      const identity = payload.sub || payload.email || payload.userId || payload.id;
      if (identity) {
        return `smartstay_owner_dashboard_v3_${String(identity).trim().toLowerCase()}`;
      }
    }
  } catch {}

  const candidates = ["smartstay_user", "currentUser", "user", "smartstay_current_user", "loggedInUser", "authUser", "userData"];
  for (const key of candidates) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      const identity = value?.email || value?.id || value?.userId || value?.username || value?.sub;
      if (identity) {
        return `smartstay_owner_dashboard_v3_${String(identity).trim().toLowerCase()}`;
      }
    } catch {}
  }

  return `smartstay_owner_dashboard_v3_guest_${getBrowserOwnerScope()}`;
}
function getBrowserOwnerScope() {
  // Never put all unidentified owners into one shared "guest" bucket.
  // A signed-in account should always use its account identity or JWT subject above.
  let scope = sessionStorage.getItem("smartstay_owner_session_scope");
  if (!scope) {
    scope = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("smartstay_owner_session_scope", scope);
  }
  return scope;
}
const STORAGE_KEY = getOwnerStorageKey();
const emptyPropertyForm = {
  name: "", description: "", address: "", city: "", area: "", mapLink: "",
  sharing2: "", sharing3: "", sharing4: "", sharing5: "",
  amenities: "", rules: "", foodMenuPhoto: "", foodOptions: [], amenityOptions: [], ruleOptions: [], customFood: "", customAmenities: "", customRules: ""
};

const money = (amount) => new Intl.NumberFormat("en-IN", {
  style: "currency", currency: "INR", maximumFractionDigits: 0
}).format(Number(amount || 0));

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function readSavedData() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function getMonthlyTotals(property, month) {
  const tenants = (property.rooms || []).flatMap((room) =>
    (room.tenants || []).map((tenant) => ({ ...tenant, roomNumber: room.number }))
  );
  const due = tenants.reduce((sum, tenant) => sum + Number(tenant.monthlyRent || 0), 0);
  const paid = tenants.reduce((sum, tenant) => sum + (tenant.payments || [])
    .filter((payment) => payment.month === month && payment.status === "Verified")
    .reduce((pSum, payment) => pSum + Number(payment.amount || 0), 0), 0);
  return { tenants: tenants.length, due, paid, pending: Math.max(0, due - paid) };
}

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  if (!key) return "—";
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

function getTenantLedger(tenant, today = new Date()) {
  const start = tenant.moveInDate ? new Date(`${tenant.moveInDate}T00:00:00`) : new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (Number.isNaN(start.getTime()) || start > today) return [];
  const dueDay = start.getDate();
  const ledger = [];
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const currentKey = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}`;
  while (cursor <= new Date(today.getFullYear(), today.getMonth(), 1)) {
    const year = cursor.getFullYear(), monthIndex = cursor.getMonth();
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    const dueDate = new Date(year, monthIndex, Math.min(dueDay, lastDay));
    if (dueDate <= today) {
      const key = `${year}-${String(monthIndex+1).padStart(2,"0")}`;
      const payments = (tenant.payments || []).filter(p => p.month === key);
      const paid = payments.filter(p => p.status === "Verified").reduce((sum,p) => sum + Number(p.amount || 0), 0);
      const pendingVerification = payments.filter(p => p.status === "Pending verification").reduce((sum,p) => sum + Number(p.amount || 0), 0);
      const rent = Number(tenant.monthlyRent || 0);
      ledger.push({ key, dueDate, rent, paid, pendingVerification, balance: Math.max(0, rent - paid) });
    }
    cursor = new Date(year, monthIndex + 1, 1);
  }
  return ledger;
}

function readImage(file, callback) {
  if (!file) return;
  if (!file.type || !file.type.startsWith("image/")) {
    window.alert("Please choose an image file (JPG, PNG or WebP).");
    return;
  }

  // Resize/compress uploads so room photos are not silently rejected just
  // because a phone camera produced a large image. The result is stored as JPEG.
  const reader = new FileReader();
  reader.onerror = () => window.alert("This image could not be read. Please try another image.");
  reader.onload = () => {
    const image = new Image();
    image.onerror = () => window.alert("This image format could not be opened. Try a JPG or PNG image.");
    image.onload = () => {
      const maxSide = 1000;
      const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const context = canvas.getContext("2d");
      if (!context) {
        window.alert("Your browser could not process this image. Please try another one.");
        return;
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let quality = 0.82;
      let result = canvas.toDataURL("image/jpeg", quality);
      while (result.length > 520000 && quality > 0.4) {
        quality -= 0.1;
        result = canvas.toDataURL("image/jpeg", quality);
      }
      if (result.length > 650000) {
        window.alert("This image is still too large after compression. Please choose a smaller image.");
        return;
      }
      callback(result);
    };
    image.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
}


function readSignedInUser() {
  const keys = ["smartstay_user", "currentUser", "user", "smartstay_current_user", "loggedInUser", "authUser", "userData"];
  for (const key of keys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (value && typeof value === "object") return { ...value, _storageKey: key };
    } catch {}
  }
  const token = localStorage.getItem("smartstay_token") || localStorage.getItem("accessToken") || localStorage.getItem("authToken") || localStorage.getItem("jwtToken") || localStorage.getItem("token") || "";
  try {
    const part = token.split(".")[1];
    if (part) {
      const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
      return { ...payload, _storageKey: "" };
    }
  } catch {}
  return { name: "", email: "", phone: "", _storageKey: "" };
}
function readComplaints() {
  const keys = ["smartstay_complaints", "tenant_complaints", "complaints", "smartstay_tenant_complaints"];
  for (const key of keys) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || "null");
      if (Array.isArray(value)) return { key, items: value };
      if (Array.isArray(value?.complaints)) return { key, items: value.complaints };
    } catch {}
  }
  return { key: "smartstay_complaints", items: [] };
}

export default function OwnerDashboard() {
  const [properties, setProperties] = useState(readSavedData);
  const [activePropertyId, setActivePropertyId] = useState(null);
  const [view, setView] = useState("overview");
  const [showPropertyForm, setShowPropertyForm] = useState(false);
  const [editingPropertyId, setEditingPropertyId] = useState(null);
  const [propertyForm, setPropertyForm] = useState({ ...emptyPropertyForm, photos: [] });
  const [roomForm, setRoomForm] = useState({ number: "", floor: "Ground floor", sharing: "2", notes: "", photoData: "" });
  const [tenantForm, setTenantForm] = useState({ name: "", phone: "", email: "", roomId: "", monthlyRent: "", moveInDate: new Date().toISOString().slice(0, 10) });
  const [paymentForm, setPaymentForm] = useState({ tenantId: "", month: currentMonth(), amount: "", method: "UPI", note: "" });
  const [search, setSearch] = useState("");
  const [tenantSearch, setTenantSearch] = useState("");
  const [openedRoomId, setOpenedRoomId] = useState(null);
  const [historyTenantId, setHistoryTenantId] = useState(null);
  const [notice, setNotice] = useState("");
  const [ownerProfile, setOwnerProfile] = useState(readSignedInUser);
  const [profileForm, setProfileForm] = useState(() => {
    const user = readSignedInUser();
    return { name: user.name || user.fullName || user.username || "", email: user.email || "", phone: user.phone || user.mobile || "" };
  });
  const [complaints, setComplaints] = useState(() => readComplaints().items);
  const [complaintFilter, setComplaintFilter] = useState("All");


  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(properties));
    } catch (error) {
      console.error("SmartStay dashboard could not save to browser storage:", error);
      setNotice("Browser storage is full. Remove large photos or export/back up your data before continuing.");
    }
  }, [properties]);

  useEffect(() => {
    const refreshComplaints = () => setComplaints(readComplaints().items);
    window.addEventListener("storage", refreshComplaints);
    return () => window.removeEventListener("storage", refreshComplaints);
  }, []);

  // Load properties from the backend
  useEffect(() => {
    const token = localStorage.getItem("smartstay_token");

    if (!token) {
      setNotice("Please sign in again to load your properties.");
      return;
    }

    let cancelled = false;

    async function loadProperties() {
      try {
        const response = await fetch(
          "http://localhost:8080/api/owner/properties",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            `Properties request failed: ${response.status}`
          );
        }

        const serverProperties = await response.json();

        if (cancelled) return;

        // The backend response is authoritative for which properties belong to
        // this signed-in owner. Keep browser-only room/tenant/payment details
        // only when they match a property returned for this owner.
        if (!Array.isArray(serverProperties)) {
          throw new Error("The properties API returned an unexpected response.");
        }

        setProperties((currentProperties) =>
          serverProperties.map((serverProperty) => {
            const existing = currentProperties.find(
              (item) =>
                String(item.serverId ?? item.id) === String(serverProperty.id)
            ) || {};

            const facilities = serverProperty.facilities
              ? serverProperty.facilities.split(",").map((x) => x.trim()).filter(Boolean)
              : [];

            return {
              ...existing,
              ...serverProperty,
              id: serverProperty.id,
              serverId: serverProperty.id,
              description: existing.description || "",
              area: existing.area || "",
              mapLink: existing.mapLink || "",
              photos: existing.photos || [],
              rooms: existing.rooms || [],
              sharingPrices: existing.sharingPrices || {},
              amenitiesList: existing.amenitiesList || facilities,
              rulesList: existing.rulesList || [],
              foodMenuItems: existing.foodMenuItems || [],
            };
          })
        );
      } catch (error) {
        console.error("Could not load backend properties:", error);

        if (!cancelled) {
          setNotice(
            "Could not load properties from the backend. Check that the backend is running."
          );
        }
      }
    }

    loadProperties();

    return () => {
      cancelled = true;
    };
  }, []);

  // Load the signed-in owner's profile
  useEffect(() => {
    const token = localStorage.getItem("smartstay_token");

    if (!token) {
      setNotice("Please sign in again to load your owner profile.");
      return;
    }

    let cancelled = false;

    async function loadOwnerProfile() {
      try {
        const response = await fetch(
          "http://localhost:8080/api/owner/profile",
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!response.ok) {
          throw new Error(
            `Profile request failed: ${response.status}`
          );
        }

        const profile = await response.json();

        if (cancelled) return;

        setOwnerProfile(profile);

        setProfileForm({
          name: profile.name || "",
          email: profile.email || "",
          phone: profile.phone || "",
        });

        localStorage.setItem(
          "smartstay_profile",
          JSON.stringify(profile)
        );
      } catch (error) {
        console.error("Could not load owner profile:", error);

        if (!cancelled) {
          setNotice(
            "Could not load your latest profile. Please check your backend connection."
          );
        }
      }
    }

    loadOwnerProfile();

    return () => {
      cancelled = true;
    };
  }, []);



  const ownerName = (ownerProfile.name || ownerProfile.fullName || ownerProfile.username || ownerProfile.email?.split("@")[0] || "Owner").trim();
  const saveOwnerProfile = (event) => {
    event.preventDefault();
    const updated = { ...ownerProfile, ...profileForm, name: profileForm.name.trim() };
    const storageKey = ownerProfile._storageKey;
    if (storageKey) {
      try {
        const stored = JSON.parse(localStorage.getItem(storageKey) || "{}");
        localStorage.setItem(storageKey, JSON.stringify({ ...stored, ...profileForm, name: profileForm.name.trim() }));
      } catch (error) {
        setNotice("Could not update the saved profile. Please check your browser storage.");
        return;
      }
    }
    setOwnerProfile(updated);
    setNotice(storageKey ? "Profile updated successfully." : "Profile updated for this dashboard session. Your login profile storage key was not found, so changes may not persist after signing out.");
  };
  const updateComplaintStatus = (complaintId, status) => {
    const source = readComplaints();
    const updated = source.items.map((item, index) =>
      String(item.id ?? item.complaintId ?? index) === String(complaintId)
        ? { ...item, status, updatedAt: new Date().toISOString() } : item
    );
    try {
      localStorage.setItem(source.key, JSON.stringify(updated));
      setComplaints(updated);
      setNotice("Complaint status updated.");
    } catch {
      setNotice("Could not save the complaint update in browser storage.");
    }
  };

  const activeProperty = properties.find((property) => property.id === activePropertyId) || null;
  const month = currentMonth();

  const updateProperty = (propertyId, updater) => {
    setProperties((items) => items.map((item) => item.id === propertyId ? updater(item) : item));
  };

  const dashboardTotals = useMemo(() => properties.reduce((totals, property) => {
    const rooms = property.rooms || [];
    const tenants = rooms.flatMap((room) => room.tenants || []);
    const maxBeds = rooms.reduce((sum, room) => sum + Number(room.sharing || 1), 0);
    const totalsForProperty = getMonthlyTotals(property, month);
    totals.rooms += rooms.length;
    totals.beds += maxBeds;
    totals.tenants += tenants.length;
    totals.paid += totalsForProperty.paid;
    totals.pending += totalsForProperty.pending;
    return totals;
  }, { rooms: 0, beds: 0, tenants: 0, paid: 0, pending: 0 }), [properties, month]);

  const activeTotals = activeProperty ? getMonthlyTotals(activeProperty, month) : null;
  const allTenantRows = properties.flatMap((property) => (property.rooms || []).flatMap((room) =>
    (room.tenants || []).map((tenant) => {
      const paid = (tenant.payments || []).filter((p) => p.month === month && p.status === "Verified")
        .reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const ledger = getTenantLedger({ ...tenant, roomNumber: room.number });
      const currentCycle = ledger.find(row => row.key === month);
      const previousBalance = ledger.filter(row => row.key !== month).reduce((sum, row) => sum + row.balance, 0);
      return { ...tenant, propertyId: property.id, propertyName: property.name, roomNumber: room.number,
        balance: currentCycle?.balance || 0, currentBalance: currentCycle?.balance || 0, previousBalance,
        totalBalance: previousBalance + (currentCycle?.balance || 0) };
    })
  ));
  const pendingTenants = allTenantRows.filter((tenant) => tenant.totalBalance > 0)
    .filter((tenant) => `${tenant.name} ${tenant.phone} ${tenant.email} ${tenant.propertyName} ${tenant.roomNumber}`
      .toLowerCase().includes(tenantSearch.toLowerCase()));
  const activeTenants = activeProperty ? (activeProperty.rooms || []).flatMap((room) =>
    (room.tenants || []).map((tenant) => ({ ...tenant, roomId: room.id, roomNumber: room.number }))
  ) : [];

  const setField = (field, value) => setPropertyForm((form) => ({ ...form, [field]: value }));

  const startEditProperty = (property) => {
    setEditingPropertyId(property.id);
    setPropertyForm({
      ...emptyPropertyForm,
      ...property,
      amenities: (property.amenitiesList || []).join(", "),
      rules: (property.rulesList || []).join(", "),
      sharing2: String(property.sharingPrices?.[2] ?? ""),
      sharing3: String(property.sharingPrices?.[3] ?? ""),
      sharing4: String(property.sharingPrices?.[4] ?? ""),
      sharing5: String(property.sharingPrices?.[5] ?? ""),
      photos: property.photos || [],
      foodMenuPhoto: property.foodMenuPhoto || "",
      foodOptions: property.foodOptions || [],
      amenityOptions: property.amenityOptions || property.amenitiesList || [],
      ruleOptions: property.ruleOptions || property.rulesList || [],
      customFood: property.customFood || "",
      customAmenities: property.customAmenities || "",
      customRules: property.customRules || ""
    });
    setShowPropertyForm(true);
  };


const saveProperty = async (event) => {
  event.preventDefault();

  if (!propertyForm.name.trim()) {
    setNotice("Please enter a property/hostel name.");
    return;
  }

  const token = localStorage.getItem("smartstay_token");

  if (!token) {
    setNotice("Please sign in again before saving a property.");
    return;
  }

  const updates = {
    ...propertyForm,
    photos: propertyForm.photos || [],
    amenitiesList: [
      ...new Set([
        ...(propertyForm.amenityOptions || []),
        ...(propertyForm.customAmenities || "")
          .split(",").map((item) => item.trim()).filter(Boolean),
        ...(propertyForm.amenities || "")
          .split(",").map((item) => item.trim()).filter(Boolean),
      ]),
    ],
    rulesList: [
      ...new Set([
        ...(propertyForm.ruleOptions || []),
        ...(propertyForm.customRules || "")
          .split(",").map((item) => item.trim()).filter(Boolean),
        ...(propertyForm.rules || "")
          .split(",").map((item) => item.trim()).filter(Boolean),
      ]),
    ],
    foodMenuItems: [
      ...new Set([
        ...(propertyForm.foodOptions || []),
        ...(propertyForm.customFood || "")
          .split(",").map((item) => item.trim()).filter(Boolean),
      ]),
    ],
    sharingPrices: {
      2: Number(propertyForm.sharing2 || 0),
      3: Number(propertyForm.sharing3 || 0),
      4: Number(propertyForm.sharing4 || 0),
      5: Number(propertyForm.sharing5 || 0),
    },
  };

  try {
    // Existing backend properties are not duplicated.
    // Editing them needs a backend PUT endpoint, which we have
    // not implemented yet.
    if (editingPropertyId) {
      const existing = properties.find(
        (item) => item.id === editingPropertyId
      );

      if (existing?.serverId) {
        setNotice(
          "This property is in the database. Backend editing is the next step; your changes were not submitted."
        );
        return;
      }

      setProperties((items) =>
        items.map((item) =>
          item.id === editingPropertyId
            ? { ...item, ...updates, rooms: item.rooms || [] }
            : item
        )
      );

      setActivePropertyId(editingPropertyId);
      setNotice("Local property details updated.");
    } else {
      const response = await fetch(
        "http://localhost:8080/api/owner/properties",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: propertyForm.name.trim(),
            address: propertyForm.address.trim(),
            city: propertyForm.city.trim(),
            totalRooms: 0,
            monthlyRent: Number(propertyForm.sharing2 || 0),
            facilities: updates.amenitiesList.join(", "),
          }),
        }
      );

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Save failed: ${response.status}`);
      }

      const saved = await response.json();

      const newProperty = {
        ...updates,
        id: saved.id,
        serverId: saved.id,
        rooms: [],
        createdAt: new Date().toISOString(),
      };

      setProperties((items) => [newProperty, ...items]);
      setActivePropertyId(newProperty.id);
      setNotice("Property saved to the database. Next, add its rooms.");
    }

    setView("overview");
    setShowPropertyForm(false);
    setEditingPropertyId(null);
    setPropertyForm({ ...emptyPropertyForm, photos: [] });
  } catch (error) {
    console.error("Could not save property:", error);
    setNotice(
      `Could not save the property: ${error.message}. Please check the backend and try again.`
    );
  }
};
  const addRoom = (event) => {
    event.preventDefault();
    if (!activeProperty || !roomForm.number.trim()) {
      setNotice("Enter a room number first.");
      return;
    }
    const duplicate = (activeProperty.rooms || []).some((room) =>
      room.number.toLowerCase() === roomForm.number.trim().toLowerCase()
    );
    if (duplicate) {
      setNotice("That room number already exists in this property.");
      return;
    }
    const room = {
      id: makeId(), number: roomForm.number.trim(), floor: roomForm.floor,
      sharing: Number(roomForm.sharing), notes: roomForm.notes.trim(), photoData: roomForm.photoData || "", tenants: []
    };
    updateProperty(activeProperty.id, (property) => ({ ...property, rooms: [...(property.rooms || []), room] }));
    setRoomForm({ number: "", floor: "Ground floor", sharing: "2", notes: "", photoData: "" });
    setNotice(`Room ${room.number} added.`);
  };

  const addTenant = (event) => {
    event.preventDefault();
    if (!activeProperty || !tenantForm.name.trim() || !tenantForm.roomId) {
      setNotice("Enter the tenant name and choose a room.");
      return;
    }
    const room = activeProperty.rooms.find((item) => item.id === tenantForm.roomId);
    if (!room) return;
    if ((room.tenants || []).length >= Number(room.sharing)) {
      setNotice(`Room ${room.number} is full. Choose another room.`);
      return;
    }
    const priceForSharing = Number(activeProperty.sharingPrices?.[room.sharing] || 0);
    const tenant = {
      id: makeId(), name: tenantForm.name.trim(), phone: tenantForm.phone.trim(),
      email: tenantForm.email.trim(), monthlyRent: Number(tenantForm.monthlyRent || priceForSharing),
      moveInDate: tenantForm.moveInDate || new Date().toISOString().slice(0, 10), payments: []
    };
    updateProperty(activeProperty.id, (property) => ({
      ...property,
      rooms: property.rooms.map((item) => item.id === room.id
        ? { ...item, tenants: [...(item.tenants || []), tenant] } : item)
    }));
    setTenantForm({ name: "", phone: "", email: "", roomId: "", monthlyRent: "", moveInDate: new Date().toISOString().slice(0, 10) });
    setNotice(`${tenant.name} added to room ${room.number}.`);
  };

  const vacateTenant = (roomId, tenantId) => {
    const tenant = activeProperty.rooms.find((room) => room.id === roomId)?.tenants.find((item) => item.id === tenantId);
    if (!window.confirm(`Vacate ${tenant?.name || "this tenant"}? Their existing payment history will be retained in this browser's archive.`)) return;
    updateProperty(activeProperty.id, (property) => ({
      ...property,
      rooms: property.rooms.map((room) => room.id === roomId
        ? { ...room, tenants: room.tenants.filter((item) => item.id !== tenantId),
            vacatedTenants: [...(room.vacatedTenants || []), ...room.tenants.filter((item) => item.id === tenantId).map((item) => ({ ...item, vacatedAt: new Date().toISOString() }))] }
        : room)
    }));
    setNotice("Tenant vacated. Their payment history remains in the room archive.");
  };

  const deleteRoom = (roomId) => {
    const room = activeProperty.rooms.find((item) => item.id === roomId);
    if (room?.tenants?.length) {
      setNotice("Vacate or move all tenants before deleting this room.");
      return;
    }
    if (!window.confirm(`Delete room ${room?.number}?`)) return;
    updateProperty(activeProperty.id, (property) => ({ ...property, rooms: property.rooms.filter((item) => item.id !== roomId) }));
    setNotice("Room deleted.");
  };

  const recordPayment = (event) => {
    event.preventDefault();
    if (!activeProperty || !paymentForm.tenantId || Number(paymentForm.amount) <= 0) {
      setNotice("Choose a tenant and enter a payment amount greater than zero.");
      return;
    }
    const tenant = activeTenants.find((item) => item.id === paymentForm.tenantId);
    if (!tenant) return;
    const payment = {
      id: makeId(), amount: Number(paymentForm.amount), month: paymentForm.month,
      method: paymentForm.method, note: paymentForm.note.trim(),
      status: "Pending verification", recordedAt: new Date().toISOString()
    };
    updateProperty(activeProperty.id, (property) => ({
      ...property,
      rooms: property.rooms.map((room) => ({
        ...room,
        tenants: (room.tenants || []).map((item) => item.id === tenant.id
          ? { ...item, payments: [...(item.payments || []), payment] } : item)
      }))
    }));
    setPaymentForm({ tenantId: "", month: currentMonth(), amount: "", method: "UPI", note: "" });
    setNotice("Payment recorded and marked pending verification.");
  };

  const verifyPayment = (tenantId, paymentId, status) => {
    updateProperty(activeProperty.id, (property) => ({
      ...property,
      rooms: property.rooms.map((room) => ({
        ...room,
        tenants: room.tenants.map((tenant) => tenant.id === tenantId
          ? { ...tenant, payments: tenant.payments.map((payment) => payment.id === paymentId ? { ...payment, status } : payment) }
          : tenant)
      }))
    }));
    setNotice(status === "Verified" ? "Payment verified." : "Payment marked as rejected.");
  };

  const deleteProperty = (property) => {
    if (!window.confirm(`Delete ${property.name} and its rooms and tenant records from this browser?`)) return;
    setProperties((items) => items.filter((item) => item.id !== property.id));
    setActivePropertyId(null);
    setView("overview");
    setNotice("Property deleted.");
  };

  const visibleProperties = properties.filter((property) =>
    `${property.name} ${property.city} ${property.area}`.toLowerCase().includes(search.toLowerCase())
  );

  const openMap = (link) => {
    if (!link) {
      setNotice("No map link has been added to this property yet.");
      return;
    }
    const safeLink = /^https?:\/\//i.test(link) ? link : `https://${link}`;
    window.open(safeLink, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="ss-owner-app">
      <aside className="ss-sidebar">
        <div className="ss-brand"><span className="ss-brand-mark">S</span><span>SmartStay<small>OWNER PORTAL</small></span></div>
        <div className="ss-sidebar-label">WORKSPACE</div>
        <button className={`ss-nav-item ${!activeProperty ? "active" : ""}`} onClick={() => { setActivePropertyId(null); setView("overview"); }}>
          <span>▦</span> Overview
        </button>
        <button className={`ss-nav-item ${activeProperty ? "active" : ""}`} onClick={() => { if (properties.length) { setActivePropertyId(activePropertyId || properties[0].id); setView("overview"); } else { setShowPropertyForm(true); } }}>
          <span>⌂</span> My properties
        </button>
        {activeProperty && <>
          <div className="ss-sidebar-label ss-sidebar-label-spaced">{activeProperty.name}</div>
          <button className={`ss-nav-item ${view === "rooms" ? "active" : ""}`} onClick={() => setView("rooms")}><span>▤</span> Rooms</button>
          <button className={`ss-nav-item ${view === "tenants" ? "active" : ""}`} onClick={() => setView("tenants")}><span>♙</span> Tenants</button>
          <button className={`ss-nav-item ${view === "payments" ? "active" : ""}`} onClick={() => setView("payments")}><span>₹</span> Payments</button>
        </>}
        <div className="ss-sidebar-label ss-sidebar-label-spaced">ACCOUNT</div>
        <button className={`ss-nav-item ${view === "complaints" ? "active" : ""}`} onClick={() => { setActivePropertyId(null); setShowPropertyForm(false); setView("complaints"); setComplaints(readComplaints().items); }}>
          <span>✉</span> Tenant complaints <span className="ss-count">{complaints.filter(c => !["Resolved", "Closed"].includes(c.status)).length}</span>
        </button>
        <button className={`ss-nav-item ${view === "profile" ? "active" : ""}`} onClick={() => { setActivePropertyId(null); setShowPropertyForm(false); setProfileForm({ name: ownerProfile.name || ownerProfile.fullName || ownerProfile.username || "", email: ownerProfile.email || "", phone: ownerProfile.phone || ownerProfile.mobile || "" }); setView("profile"); }}>
          <span>♙</span> My profile
        </button>
        <div className="ss-sidebar-bottom">
          <div className="ss-help-card"><strong>Need a hand?</strong><p>Manage rooms, tenants and fees from one place.</p></div>
          <div className="ss-profile"><div className="ss-avatar">{ownerName.charAt(0).toUpperCase()}</div><div><strong>{ownerName}</strong><small>Owner account</small></div></div>
        </div>
      </aside>

      <main className="ss-main">
        <header className="ss-topbar">
          <div className="ss-breadcrumb">SmartStay <span>/</span> {activeProperty ? activeProperty.name : "Overview"}</div>
          <div className="ss-topbar-right"><span className="ss-status-dot"></span><span>{ownerName}’s workspace</span><div className="ss-avatar ss-avatar-small">{ownerName.charAt(0).toUpperCase()}</div></div>
        </header>

        <div className="ss-content">
          {notice && <div className="ss-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss notification">×</button></div>}

          {view === "profile" && !showPropertyForm && (
            <section className="ss-form-page ss-profile-page">
              <div className="ss-page-heading"><div className="ss-eyebrow">ACCOUNT SETTINGS</div><h1>My profile</h1><p>Update the name and contact details shown in your owner dashboard.</p></div>
              <form className="ss-panel ss-form ss-profile-card" onSubmit={saveOwnerProfile}>
                <div className="ss-profile ss-profile-hero"><div className="ss-avatar" style={{width:64,height:64,fontSize:24}}>{(profileForm.name || "O").charAt(0).toUpperCase()}</div><div><strong>{profileForm.name || "Owner"}</strong><small>SmartStay owner account</small></div></div>
                <div className="ss-profile-form-grid">
                <div className="ss-field"><label>Full name *</label><input required value={profileForm.name} onChange={e => setProfileForm(form => ({...form, name:e.target.value}))} placeholder="Your full name" /></div>
                <div className="ss-field"><label>Email address</label><input type="email" value={profileForm.email} onChange={e => setProfileForm(form => ({...form, email:e.target.value}))} placeholder="you@example.com" /></div>
                <div className="ss-field"><label>Phone number</label><input type="tel" value={profileForm.phone} onChange={e => setProfileForm(form => ({...form, phone:e.target.value}))} placeholder="Your phone number" /></div>
                </div>
                <div className="ss-form-actions"><button type="button" className="ss-btn ss-btn-light" onClick={() => setView("overview")}>Cancel</button><button type="submit" className="ss-btn ss-btn-primary">Save profile changes</button></div>
              </form>
            </section>
          )}

          {view === "complaints" && !showPropertyForm && (
            <section className="ss-form-page">
              <div className="ss-page-heading"><div className="ss-eyebrow">TENANT SUPPORT</div><h1>Tenant complaints</h1><p>Review issues raised by tenants and update their status.</p></div>
              <section className="ss-panel">
                <div className="ss-panel-heading"><div><h2>Complaints inbox</h2><p>{complaints.length} complaint{complaints.length === 1 ? "" : "s"} available in this browser</p></div>
                  <select value={complaintFilter} onChange={e => setComplaintFilter(e.target.value)} aria-label="Filter complaints"><option>All</option><option>Open</option><option>In progress</option><option>Resolved</option><option>Closed</option></select>
                </div>
                {complaints.filter(c => complaintFilter === "All" || (complaintFilter === "Open" ? !c.status || c.status === "Open" || c.status === "Pending" : String(c.status || "Open").toLowerCase() === complaintFilter.toLowerCase())).length ? (
                  <div className="ss-payment-list">
                    {complaints.filter(c => complaintFilter === "All" || (complaintFilter === "Open" ? !c.status || c.status === "Open" || c.status === "Pending" : String(c.status || "Open").toLowerCase() === complaintFilter.toLowerCase())).map((c, index) => {
                      const id = c.id ?? c.complaintId ?? index;
                      const status = c.status || "Open";
                      return <article key={id} className="ss-payment-row" style={{alignItems:"flex-start"}}>
                        <div className="ss-payment-symbol">✉</div>
                        <div className="ss-payment-info" style={{flex:1,whiteSpace:"normal"}}>
                          <strong>{c.title || c.subject || c.category || "Tenant complaint"}</strong>
                          <span>{c.tenantName || c.name || c.email || "Tenant"}{c.propertyName ? ` · ${c.propertyName}` : ""}{c.roomNumber ? ` · Room ${c.roomNumber}` : ""}</span>
                          <p style={{margin:"8px 0",whiteSpace:"pre-wrap"}}>{c.message || c.description || c.complaint || "No complaint details were provided."}</p>
                          <small>{c.createdAt || c.date ? new Date(c.createdAt || c.date).toLocaleString("en-IN") : "Date not provided"}</small>
                        </div>
                        <div className="ss-payment-end"><span className={`ss-payment-status ${status === "Resolved" || status === "Closed" ? "is-verified" : status === "In progress" ? "is-pending" : "is-rejected"}`}>{status}</span>
                          <select aria-label={`Update status for ${c.title || c.subject || "complaint"}`} value={status} onChange={e => updateComplaintStatus(id, e.target.value)}><option>Open</option><option>In progress</option><option>Resolved</option><option>Closed</option></select>
                        </div>
                      </article>;
                    })}
                  </div>
                ) : <EmptyInline text="No complaints found for this filter. If tenants submit complaints from a different device or through the backend, connect this page to that shared complaint API to receive them here." />}
              </section>
            </section>
          )}

          {!activeProperty && !showPropertyForm && view !== "profile" && view !== "complaints" && (
            <>
              <section className="ss-welcome">
                <div><div className="ss-eyebrow">YOUR HOSTEL, SIMPLIFIED</div><h1>Good day, {ownerName} <span>✦</span></h1><p>Keep your properties, rooms, tenants and monthly collections organised.</p></div>
                <button className="ss-btn ss-btn-primary" onClick={() => setShowPropertyForm(true)}>＋ Add property</button>
              </section>
              {properties.length === 0 ? (
                <section className="ss-empty-state">
                  <div className="ss-empty-illustration">⌂</div><h2>Let's add your first property</h2>
                  <p>Set up your hostel, define sharing prices, and add rooms and tenants when you're ready.</p>
                  <button className="ss-btn ss-btn-primary" onClick={() => setShowPropertyForm(true)}>＋ Add your first property</button>
                </section>
              ) : (
                <>
                  <section className="ss-stat-grid">
                    <StatCard label="Properties" value={properties.length} hint="Hostels you manage" icon="⌂" />
                    <StatCard label="Total rooms" value={dashboardTotals.rooms} hint={`${dashboardTotals.beds} total bed capacity`} icon="▤" />
                    <StatCard label="Active tenants" value={dashboardTotals.tenants} hint="Currently assigned" icon="♙" />
                  </section>
                  <section className="ss-section">
                    <div className="ss-section-heading"><div><h2>Your properties</h2><p>Choose a property to manage its rooms, tenants and fees.</p></div><div className="ss-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search properties" /></div></div>
                    <div className="ss-property-grid">
                      {visibleProperties.map((property) => <PropertyCard key={property.id} property={property} onOpen={() => { setActivePropertyId(property.id); setView("overview"); }} onEdit={() => startEditProperty(property)} onMap={() => openMap(property.mapLink)} onDelete={() => deleteProperty(property)} />)}
                    </div>
                    {visibleProperties.length === 0 && <p className="ss-muted">No properties match your search.</p>}
                  </section>
                </>
              )}
            </>
          )}

          {showPropertyForm && (
            <section className="ss-form-page">
              <button className="ss-back-link" onClick={() => setShowPropertyForm(false)}>← Back to dashboard</button>
              <div className="ss-page-heading"><div className="ss-eyebrow">PROPERTY SETUP</div><h1>{editingPropertyId ? "Edit property" : "Add a property"}</h1><p>{editingPropertyId ? "Update your hostel details, photos and sharing prices without changing its rooms or tenants." : "Enter your hostel details and set monthly prices for each sharing type."}</p></div>
              <form className="ss-panel ss-form" onSubmit={saveProperty}>
                <FormSection number="01" title="Basic information" subtitle="Give your property a name and location.">
                  <div className="ss-field"><label>Hostel / property name *</label><input required value={propertyForm.name} onChange={(e) => setField("name", e.target.value)} placeholder="e.g. SmartStay Residency" /></div>
                  <div className="ss-field"><label>Description</label><textarea rows="3" value={propertyForm.description} onChange={(e) => setField("description", e.target.value)} placeholder="Tell tenants what makes your hostel comfortable..." /></div>
                  <div className="ss-field"><label>Street address</label><input value={propertyForm.address} onChange={(e) => setField("address", e.target.value)} placeholder="Building, street, landmark" /></div>
                  <div className="ss-two-col"><div className="ss-field"><label>Area / locality</label><input value={propertyForm.area} onChange={(e) => setField("area", e.target.value)} placeholder="e.g. Madhapur" /></div><div className="ss-field"><label>City</label><input value={propertyForm.city} onChange={(e) => setField("city", e.target.value)} placeholder="e.g. Hyderabad" /></div></div>
                  <div className="ss-field"><label>Google Maps sharing link</label><div className="ss-map-input"><input type="url" value={propertyForm.mapLink} onChange={(e) => setField("mapLink", e.target.value)} placeholder="Paste your Google Maps link (https://...)" /><button type="button" className="ss-btn ss-btn-light" disabled={!propertyForm.mapLink} onClick={() => openMap(propertyForm.mapLink)}>Test link ↗</button></div><small>Use “Share” in Google Maps and paste the copied link. Test link opens in a new tab.</small></div>
                </FormSection>
                <FormSection number="02" title="Property photos" subtitle="Choose photos from your computer; click a saved photo to view it. Add a few reasonably sized images.">
                  <div className="ss-field"><label>Upload property photos</label><input type="file" accept="image/*" multiple onChange={(e) => { const files = Array.from(e.target.files || []).slice(0, 5); Promise.all(files.map(file => new Promise(resolve => readImage(file, resolve)))).then(images => setPropertyForm(form => ({ ...form, photos: [...(form.photos || []), ...images].slice(0, 5) }))); e.target.value = ""; }} /></div>
                  {!!propertyForm.photos?.length && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{propertyForm.photos.map((src,i) => <img key={i} src={src} alt={`Property photo ${i+1}`} onClick={() => window.open(src,"_blank","noopener,noreferrer")} style={{width:84,height:70,objectFit:"cover",borderRadius:8,cursor:"pointer"}} />)}</div>}
                </FormSection>
                <FormSection number="03" title="Monthly sharing prices" subtitle="Set the monthly rent per tenant for each sharing option.">
                  <div className="ss-sharing-grid">
                    {[2,3,4,5].map((sharing) => <div className="ss-field ss-price-field" key={sharing}><label>{sharing} sharing <small>per person / month</small></label><div className="ss-price-input"><span>₹</span><input type="number" min="0" value={propertyForm[`sharing${sharing}`]} onChange={(e) => setField(`sharing${sharing}`, e.target.value)} placeholder="0" /></div></div>)}
                  </div>
                  <p className="ss-inline-tip">You can override the rent for an individual tenant when assigning a room.</p>
                </FormSection>
                <FormSection number="04" title="Food menu, facilities and house rules" subtitle="Keep the checkboxes, choose presets, and add your own options. These settings belong to this property.">
                  <div className="ss-field"><label>Food menu options</label><div className="ss-option-grid">{["Breakfast", "Lunch", "Dinner", "Tea / snacks", "Vegetarian", "Non-vegetarian", "Sunday special", "Weekly menu changes"].map(option => <label className="ss-option" key={option}><input type="checkbox" checked={(propertyForm.foodOptions || []).includes(option)} onChange={e => setField("foodOptions", e.target.checked ? [...(propertyForm.foodOptions || []), option] : (propertyForm.foodOptions || []).filter(x => x !== option))}/><span>{option}</span></label>)}</div></div>
                  <div className="ss-field"><label>Other food details / menu items</label><textarea rows="2" value={propertyForm.customFood || ""} onChange={e => setField("customFood", e.target.value)} placeholder="e.g. Idli, dosa, rice, chapati (separate with commas)" /></div>
                  <div className="ss-field"><label>Food menu photo</label><input type="file" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) readImage(file, (photo) => setField("foodMenuPhoto", photo)); e.target.value = ""; }} /><small>Upload a clear JPG or PNG of the menu. It is saved with this property.</small>{propertyForm.foodMenuPhoto && <div className="ss-food-menu-preview"><img src={propertyForm.foodMenuPhoto} alt="Food menu preview" onClick={() => window.open(propertyForm.foodMenuPhoto, "_blank", "noopener,noreferrer")} /><button type="button" className="ss-btn ss-btn-light ss-btn-small" onClick={() => setField("foodMenuPhoto", "")}>Remove menu photo</button></div>}</div>
                  <div className="ss-field"><label>Facilities / amenities</label><div className="ss-option-grid">{["Wi-Fi", "Laundry", "Washing machine", "RO drinking water", "Power backup", "CCTV", "Parking", "Housekeeping", "Hot water", "Lift", "Study room", "Common area"].map(option => <label className="ss-option" key={option}><input type="checkbox" checked={(propertyForm.amenityOptions || []).includes(option)} onChange={e => setField("amenityOptions", e.target.checked ? [...(propertyForm.amenityOptions || []), option] : (propertyForm.amenityOptions || []).filter(x => x !== option))}/><span>{option}</span></label>)}</div><input value={propertyForm.customAmenities || ""} onChange={e => setField("customAmenities", e.target.value)} placeholder="Other facilities, comma-separated" /></div>
                  <div className="ss-field"><label>House rules</label><div className="ss-option-grid">{["Visitors before 8 PM", "Keep common areas clean", "No smoking", "No alcohol", "Quiet hours after 10 PM", "Inform before overnight leave", "Switch off lights when leaving", "Pay rent on time"].map(option => <label className="ss-option" key={option}><input type="checkbox" checked={(propertyForm.ruleOptions || []).includes(option)} onChange={e => setField("ruleOptions", e.target.checked ? [...(propertyForm.ruleOptions || []), option] : (propertyForm.ruleOptions || []).filter(x => x !== option))}/><span>{option}</span></label>)}</div><input value={propertyForm.customRules || ""} onChange={e => setField("customRules", e.target.value)} placeholder="Other house rules, comma-separated" /></div>
                </FormSection>
                <div className="ss-form-actions"><button type="button" className="ss-btn ss-btn-light" onClick={() => { setShowPropertyForm(false); setEditingPropertyId(null); setPropertyForm({ ...emptyPropertyForm, photos: [] }); }}>Cancel</button><button type="submit" className="ss-btn ss-btn-primary">{editingPropertyId ? "Save changes ✓" : "Save property →"}</button></div>
              </form>
            </section>
          )}

          {activeProperty && !showPropertyForm && (
            <>
              <section className="ss-property-hero">
                <button className="ss-back-link" onClick={() => { setActivePropertyId(null); setView("overview"); }}>← All properties</button>
                <div className="ss-property-hero-row"><div><div className="ss-eyebrow">PROPERTY MANAGEMENT</div><h1>{activeProperty.name}</h1><p>{[activeProperty.area, activeProperty.city, activeProperty.address].filter(Boolean).join(" · ") || "Address not added"}</p></div><div className="ss-hero-actions"><button className="ss-btn ss-btn-light" onClick={() => startEditProperty(activeProperty)}>✎ Edit property</button><button className="ss-btn ss-btn-light" onClick={() => openMap(activeProperty.mapLink)}>↗ Open map</button><button className="ss-btn ss-btn-danger-outline" onClick={() => deleteProperty(activeProperty)}>Delete property</button></div></div>
                {activeProperty.description && <p className="ss-property-description">{activeProperty.description}</p>}
                {activeProperty.foodMenuPhoto && <section className="ss-panel ss-food-menu-panel"><h2>Food menu</h2><img src={activeProperty.foodMenuPhoto} alt={`${activeProperty.name} food menu`} onClick={() => window.open(activeProperty.foodMenuPhoto, "_blank", "noopener,noreferrer")} /><p className="ss-muted">Saved menu photo for this property.</p></section>}
                <div className="ss-chip-row">{(activeProperty.amenitiesList || []).map((amenity) => <span className="ss-chip" key={amenity}>{amenity}</span>)}</div>
                <div className="ss-tabs">
                  {["overview","rooms","tenants","payments"].map((tab) => <button key={tab} className={view === tab ? "active" : ""} onClick={() => setView(tab)}>{tab[0].toUpperCase()+tab.slice(1)}</button>)}
                </div>
              </section>

              {view === "overview" && (
                <>
                  <section className="ss-stat-grid ss-stat-grid-compact">
                    <StatCard label="Rooms" value={(activeProperty.rooms || []).length} hint={`${(activeProperty.rooms || []).reduce((sum, room) => sum + Number(room.sharing || 1), 0)} bed capacity`} icon="▤" />
                    <StatCard label="Occupied beds" value={activeTenants.length} hint={`${Math.max(0, (activeProperty.rooms || []).reduce((sum, room) => sum + Number(room.sharing || 1), 0) - activeTenants.length)} beds available`} icon="♙" />
                    <StatCard label="Collected this month" value={money(activeTotals.paid)} hint="Verified payments only" icon="✓" />
                    <StatCard label="Pending this month" value={money(activeTotals.pending)} hint="Outstanding balance" icon="₹" tone="amber" />
                  </section>
                  <section className="ss-panel" style={{marginBottom:20}}><div className="ss-panel-heading"><div><h2>Pending tenants</h2><p>Current month balance, previous unpaid months, and total outstanding for this property.</p></div><div className="ss-search"><span>⌕</span><input value={tenantSearch} onChange={(event) => setTenantSearch(event.target.value)} placeholder="Search name, phone, room" /></div></div>
                    {pendingTenants.filter(t => t.propertyId === activeProperty.id).length ? <div className="ss-table-wrap"><table className="ss-table"><thead><tr><th>Tenant</th><th>Room</th><th>Joining date</th><th>This month</th><th>Previous balance</th><th>Total pending</th><th>Action</th></tr></thead><tbody>{pendingTenants.filter(t => t.propertyId === activeProperty.id && t.totalBalance > 0).map(t => <tr key={t.id}><td><strong>{t.name}</strong><small style={{display:"block"}}>{t.phone || t.email || "Contact not added"}</small></td><td>{t.roomNumber}</td><td>{t.moveInDate || "Not recorded"}</td><td className="ss-pending-text">{money(t.currentBalance)}</td><td className="ss-pending-text">{money(t.previousBalance)}</td><td className="ss-pending-text">{money(t.totalBalance)}</td><td><button className="ss-table-action" onClick={() => { setView("payments"); setPaymentForm({ tenantId: t.id, month: currentMonth(), amount: "", method: "UPI", note: "" }); }}>Record payment</button></td></tr>)}</tbody></table></div> : <p className="ss-muted">No tenants have outstanding rent in this property.</p>}
                  </section>
                  <div className="ss-content-columns">
                    <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Room overview</h2><p>Live occupancy based on assigned tenants.</p></div><button className="ss-text-button" onClick={() => setView("rooms")}>Manage rooms →</button></div>
                      {activeProperty.rooms.length ? <div className="ss-room-mini-grid">{activeProperty.rooms.slice(0, 8).map((room) => <RoomTile key={room.id} room={room} />)}</div> : <EmptyInline text="No rooms added yet. Add room numbers and sharing capacity to begin." buttonText="Add rooms" onClick={() => setView("rooms")} />}
                    </section>
                    <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Sharing prices</h2><p>Monthly price per tenant.</p></div></div><div className="ss-price-list">{[2,3,4,5].map((sharing) => <div key={sharing}><span>{sharing} sharing</span><strong>{Number(activeProperty.sharingPrices?.[sharing]) ? money(activeProperty.sharingPrices[sharing]) : "Not set"}</strong></div>)}</div><div className="ss-panel-footer"><span className="ss-muted">Need to add more rooms?</span><button className="ss-btn ss-btn-primary ss-btn-small" onClick={() => setView("rooms")}>Manage rooms</button></div></section>
                  </div>
                </>
              )}

              {view === "rooms" && (
                <div className="ss-content-columns ss-room-layout">
                  <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Add a room</h2><p>Room numbers must be unique within this property.</p></div></div>
                    <form className="ss-form ss-form-tight" onSubmit={addRoom}>
                      <div className="ss-field"><label>Room number *</label><input required value={roomForm.number} onChange={(e) => setRoomForm({ ...roomForm, number: e.target.value })} placeholder="e.g. 101" /></div>
                      <div className="ss-field"><label>Floor</label><select value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })}><option>Ground floor</option><option>1st floor</option><option>2nd floor</option><option>3rd floor</option><option>4th floor</option><option>5th floor</option><option>Other</option></select></div>
                      <div className="ss-field"><label>Sharing / capacity *</label><select value={roomForm.sharing} onChange={(e) => setRoomForm({ ...roomForm, sharing: e.target.value })}><option value="2">2 sharing</option><option value="3">3 sharing</option><option value="4">4 sharing</option><option value="5">5 sharing</option></select></div>
                      <div className="ss-field"><label>Notes (optional)</label><input value={roomForm.notes} onChange={(e) => setRoomForm({ ...roomForm, notes: e.target.value })} placeholder="AC, attached bathroom..." /></div>
                      <div className="ss-field ss-room-photo-field"><label htmlFor="ss-room-photo-upload">Room photo (optional)</label><input id="ss-room-photo-upload" type="file" accept="image/jpeg,image/png,image/webp,image/*" onChange={(e) => { const file = e.target.files && e.target.files[0]; readImage(file, image => setRoomForm(form => ({ ...form, photoData: image }))); e.target.value = ""; }} />{roomForm.photoData ? <div className="ss-room-photo-preview"><img src={roomForm.photoData} alt="Selected room preview" onClick={() => window.open(roomForm.photoData,"_blank","noopener,noreferrer")} /><span>Photo ready — it will appear on the room card after you add the room.</span><button type="button" className="ss-text-button" onClick={() => setRoomForm(form => ({ ...form, photoData: "" }))}>Remove photo</button></div> : <p className="ss-muted">Choose a photo to see a preview here.</p>}</div>
                      <button className="ss-btn ss-btn-primary ss-btn-full" type="submit">＋ Add room</button>
                    </form>
                  </section>
                  <section className="ss-panel"><div className="ss-panel-heading"><div><h2>All rooms <span className="ss-count">{activeProperty.rooms.length}</span></h2><p>Select a room's tenant action from the room card.</p></div></div>
                    {activeProperty.rooms.length ? <div className="ss-room-grid">{activeProperty.rooms.map((room) => <div className="ss-room-card" key={room.id}><div className="ss-room-card-top">{room.photoData ? <img src={room.photoData} alt={`Room ${room.number}`} style={{width:58,height:58,objectFit:"cover",borderRadius:10,cursor:"pointer"}} onClick={() => window.open(room.photoData, "_blank", "noopener,noreferrer")} title="Click to view photo" /> : <div className="ss-room-icon">▤</div>}<span className={`ss-pill ${room.tenants.length >= room.sharing ? "ss-pill-full" : "ss-pill-open"}`}>{room.tenants.length >= room.sharing ? "Full" : "Available"}</span></div><h3>Room {room.number}</h3><p>{room.floor} · {room.sharing} sharing</p><div className="ss-occupancy"><div><span>Occupancy</span><strong>{room.tenants.length}/{room.sharing}</strong></div><div className="ss-progress"><span style={{ width: `${Math.min(100, room.tenants.length / room.sharing * 100)}%` }} /></div></div>{room.notes && <p className="ss-room-notes">{room.notes}</p>}<button className="ss-btn ss-btn-light ss-btn-small ss-btn-full" onClick={() => { setOpenedRoomId(room.id); setTenantSearch(""); setHistoryTenantId(null); setView("tenants"); }}>{`Open room tenants (${room.tenants.length})`}</button>{openedRoomId === room.id && <div className="ss-room-tenants">{room.tenants.length ? room.tenants.map((tenant) => { const paid = (tenant.payments || []).filter((p) => p.month === month && p.status === "Verified").reduce((sum, p) => sum + Number(p.amount || 0), 0); return <div className="ss-room-tenant" key={tenant.id}><span className="ss-mini-avatar">{tenant.name.charAt(0).toUpperCase()}</span><span>{tenant.name}<small style={{display:"block"}}>{tenant.phone || tenant.email || "Contact not added"} · Pending {money(Math.max(0, Number(tenant.monthlyRent || 0) - paid))}</small><button className="ss-table-action" onClick={() => { setView("tenants"); setHistoryTenantId(tenant.id); }}>Details & history</button></span><button title={`Vacate ${tenant.name}`} onClick={() => vacateTenant(room.id, tenant.id)}>Vacate</button></div>; }) : <span className="ss-muted">No tenants assigned</span>}</div>}<button className="ss-btn ss-btn-light ss-btn-small ss-btn-full" onClick={() => { setView("tenants"); setTenantForm((form) => ({ ...form, roomId: room.id, monthlyRent: activeProperty.sharingPrices?.[room.sharing] || "" })); }}>＋ Add tenant</button><button className="ss-delete-room" onClick={() => deleteRoom(room.id)}>Delete room</button></div>)}</div> : <EmptyInline text="No rooms yet. Use the form to add your first room." /> }
                  </section>
                </div>
              )}

              {view === "tenants" && (
                <div className="ss-content-columns ss-tenant-layout">
                  <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Add a tenant</h2><p>Assign the tenant to an available room.</p></div></div>
                    <form className="ss-form ss-form-tight" onSubmit={addTenant}>
                      <div className="ss-field"><label>Tenant full name *</label><input required value={tenantForm.name} onChange={(e) => setTenantForm({ ...tenantForm, name: e.target.value })} placeholder="Enter full name" /></div>
                      <div className="ss-field"><label>Phone number</label><input type="tel" value={tenantForm.phone} onChange={(e) => setTenantForm({ ...tenantForm, phone: e.target.value })} placeholder="Phone number" /></div>
                      <div className="ss-field"><label>Email address</label><input type="email" value={tenantForm.email} onChange={(e) => setTenantForm({ ...tenantForm, email: e.target.value })} placeholder="tenant@example.com" /></div>
                      <div className="ss-field"><label>Room *</label><select required value={tenantForm.roomId} onChange={(e) => { const room = activeProperty.rooms.find((item) => item.id === e.target.value); setTenantForm({ ...tenantForm, roomId: e.target.value, monthlyRent: room ? (activeProperty.sharingPrices?.[room.sharing] || "") : "" }); setOpenedRoomId(e.target.value || null); }}><option value="">Select an available room</option>{activeProperty.rooms.filter((room) => room.tenants.length < room.sharing).map((room) => <option key={room.id} value={room.id}>Room {room.number} · {room.sharing} sharing · {room.sharing - room.tenants.length} bed(s) free</option>)}</select></div>
                      <div className="ss-field"><label>Joining date *</label><input required type="date" value={tenantForm.moveInDate || ""} onChange={(e) => setTenantForm({ ...tenantForm, moveInDate: e.target.value })} /></div>
                      <div className="ss-field"><label>Monthly rent (₹) *</label><input required type="number" min="0" value={tenantForm.monthlyRent} onChange={(e) => setTenantForm({ ...tenantForm, monthlyRent: e.target.value })} placeholder="Monthly amount" /></div>
                      <button className="ss-btn ss-btn-primary ss-btn-full" type="submit">＋ Add tenant</button>
                    </form>
                  </section>
                  <section className="ss-panel"><div className="ss-panel-heading"><div><h2>{openedRoomId && activeProperty?.rooms.find((r) => r.id === openedRoomId) ? `Room ${activeProperty.rooms.find((r) => r.id === openedRoomId).number} tenants` : "Current tenants"} <span className="ss-count">{(openedRoomId ? activeTenants.filter((t) => t.roomId === openedRoomId) : activeTenants).length}</span></h2><p>{openedRoomId && activeProperty?.rooms.find((r) => r.id === openedRoomId) ? `Showing tenants assigned only to Room ${activeProperty.rooms.find((r) => r.id === openedRoomId).number}.` : `Room allocation and monthly balance for ${month}. Select a room from Manage Rooms to see only that room's tenants.`}</p></div><div className="ss-search"><span>⌕</span><input value={tenantSearch} onChange={(event) => setTenantSearch(event.target.value)} placeholder="Search tenants" /></div>{openedRoomId && <button className="ss-btn ss-btn-light ss-btn-small" onClick={() => { setOpenedRoomId(null); setHistoryTenantId(null); }}>Show all rooms</button>}</div>
                    {!openedRoomId ? <p className="ss-muted" style={{padding:16}}>No tenant list shown yet. Open a room to see its tenants.</p> : (activeTenants.filter((t) => t.roomId === openedRoomId)).length ? <div className="ss-table-wrap"><table className="ss-table"><thead><tr><th>Tenant</th><th>Room</th><th>Monthly rent</th><th>Paid this month</th><th>Previous pending</th><th>Total balance</th><th>Action</th></tr></thead><tbody>{(openedRoomId ? activeTenants.filter((t) => t.roomId === openedRoomId) : activeTenants).filter((tenant) => `${tenant.name} ${tenant.phone} ${tenant.email} ${tenant.roomNumber}`.toLowerCase().includes(tenantSearch.toLowerCase())).map((tenant) => { const ledger = getTenantLedger(tenant); const currentCycle = ledger.find((item) => item.key === month); const paid = currentCycle?.paid || 0; const currentBalance = currentCycle?.balance || 0; const previousBalance = ledger.filter((item) => item.key < month).reduce((sum, item) => sum + item.balance, 0); const totalBalance = previousBalance + currentBalance; return <tr key={tenant.id}><td><div className="ss-tenant-cell"><span className="ss-mini-avatar">{tenant.name.charAt(0).toUpperCase()}</span><div><strong>{tenant.name}</strong><small>{tenant.phone || tenant.email || "Contact not added"}</small></div></div></td><td>{tenant.roomNumber}</td><td>{money(tenant.monthlyRent)}</td><td className="ss-paid-text">{money(paid)}</td><td className={previousBalance ? "ss-pending-text" : "ss-paid-text"}>{money(previousBalance)}</td><td className={totalBalance ? "ss-pending-text" : "ss-paid-text"}>{money(totalBalance)}</td><td><button className="ss-table-action" onClick={() => { setView("payments"); setPaymentForm({ tenantId: tenant.id, month: currentMonth(), amount: "", method: "UPI", note: "" }); }}>Record payment</button><button className="ss-table-action" onClick={() => setHistoryTenantId(historyTenantId === tenant.id ? null : tenant.id)}>History</button><button className="ss-table-action ss-table-action-danger" onClick={() => vacateTenant(tenant.roomId, tenant.id)}>Vacate</button></td></tr>; })}</tbody></table></div> : <EmptyInline text={openedRoomId ? "No tenants are assigned to this room yet." : "No tenants yet. Open a room from Manage Rooms to see its tenants, or add a tenant here."} buttonText="Manage rooms" onClick={() => setView("rooms")} />}
                    {historyTenantId && activeTenants.some((t) => t.id === historyTenantId) && (() => { const t = activeTenants.find((item) => item.id === historyTenantId); return <div className="ss-panel-footer" style={{display:"block"}}><h3>Payment history — {t.name}</h3><p>Room {t.roomNumber} · Monthly rent {money(t.monthlyRent)}</p><h4>Monthly rent history</h4><div className="ss-table-wrap"><table className="ss-table"><thead><tr><th>Month</th><th>Due date</th><th>Rent due</th><th>Paid and verified</th><th>Awaiting verification</th><th>Balance carried forward</th></tr></thead><tbody>{getTenantLedger(t).map((cycle) => <tr key={cycle.key}><td>{monthLabel(cycle.key)}</td><td>{cycle.dueDate.toLocaleDateString("en-IN")}</td><td>{money(cycle.rent)}</td><td className="ss-paid-text">{money(cycle.paid)}</td><td>{money(cycle.pendingVerification)}</td><td className={cycle.balance ? "ss-pending-text" : "ss-paid-text"}>{money(cycle.balance)}</td></tr>)}</tbody></table></div><h4>Payment transactions</h4>{(t.payments || []).length ? <div className="ss-table-wrap"><table className="ss-table"><thead><tr><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Date recorded</th><th>Note</th></tr></thead><tbody>{[...(t.payments || [])].sort((a,b) => String(b.recordedAt || "").localeCompare(String(a.recordedAt || ""))).map((p) => <tr key={p.id}><td>{monthLabel(p.month)}</td><td>{money(p.amount)}</td><td>{p.method}</td><td>{p.status}</td><td>{p.recordedAt ? new Date(p.recordedAt).toLocaleDateString() : "—"}</td><td>{p.note || "—"}</td></tr>)}</tbody></table></div> : <p className="ss-muted">No payments recorded for this tenant yet.</p>}</div>; })()}
                  </section>
                </div>
              )}

              {view === "payments" && (
                <div className="ss-content-columns ss-payment-layout">
                  <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Record a payment</h2><p>New payments require owner verification.</p></div></div>
                    <form className="ss-form ss-form-tight" onSubmit={recordPayment}>
                      <div className="ss-field"><label>Tenant *</label><select required value={paymentForm.tenantId} onChange={(e) => setPaymentForm({ ...paymentForm, tenantId: e.target.value })}><option value="">Choose tenant</option>{activeTenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name} · Room {tenant.roomNumber}</option>)}</select></div>
                      <div className="ss-field"><label>Month *</label><input type="month" required value={paymentForm.month} onChange={(e) => setPaymentForm({ ...paymentForm, month: e.target.value })} /></div>
                      <div className="ss-field"><label>Amount received (₹) *</label><input type="number" min="1" required value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} placeholder="Amount" /></div>
                      <div className="ss-field"><label>Payment method</label><select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}><option>UPI</option><option>Cash</option><option>Bank transfer</option><option>Card</option><option>Other</option></select></div>
                      <div className="ss-field"><label>Reference / notes</label><input value={paymentForm.note} onChange={(e) => setPaymentForm({ ...paymentForm, note: e.target.value })} placeholder="Transaction reference (optional)" /></div>
                      <button className="ss-btn ss-btn-primary ss-btn-full" type="submit">＋ Record payment</button>
                    </form>
                  </section>
                  <section className="ss-panel"><div className="ss-panel-heading"><div><h2>Payment verification</h2><p>Verify received payments to update fee totals.</p></div></div>
                    {activeTenants.some((tenant) => tenant.payments?.length) ? <div className="ss-payment-list">{activeTenants.flatMap((tenant) => (tenant.payments || []).map((payment) => ({ ...payment, tenantName: tenant.name, tenantId: tenant.id, roomNumber: tenant.roomNumber }))).sort((a,b) => b.recordedAt.localeCompare(a.recordedAt)).map((payment) => <div className="ss-payment-row" key={payment.id}><div className="ss-payment-symbol">₹</div><div className="ss-payment-info"><strong>{payment.tenantName} · Room {payment.roomNumber}</strong><span>{payment.month} · {payment.method}{payment.note ? ` · ${payment.note}` : ""}</span><small>{new Date(payment.recordedAt).toLocaleString()}</small></div><div className="ss-payment-end"><strong>{money(payment.amount)}</strong><span className={`ss-payment-status ${payment.status === "Verified" ? "is-verified" : payment.status === "Rejected" ? "is-rejected" : "is-pending"}`}>{payment.status}</span>{payment.status === "Pending verification" && <div className="ss-payment-actions"><button onClick={() => verifyPayment(payment.tenantId, payment.id, "Verified")}>Verify</button><button onClick={() => verifyPayment(payment.tenantId, payment.id, "Rejected")}>Reject</button></div>}</div></div>)}</div> : <EmptyInline text="No payment records yet. Record a payment after receiving it from a tenant." />}
                  </section>
                  <section className="ss-panel" style={{gridColumn:"1 / -1"}}>
                    <div className="ss-panel-heading"><div><h2>Monthly rent cycle & arrears</h2><p>Rent becomes due on the tenant's joining-date day each month. Previous unpaid months carry forward.</p></div></div>
                    {activeTenants.length ? <div className="ss-table-wrap"><table className="ss-table"><thead><tr><th>Tenant / room</th><th>Joining date</th><th>Month</th><th>Due date</th><th>Rent</th><th>Verified paid</th><th>Pending verification</th><th>Month balance</th><th>Running arrears</th></tr></thead><tbody>{activeTenants.flatMap(t => { const ledger = getTenantLedger(t); let arrears = 0; return ledger.map(row => { arrears += row.balance; return <tr key={`${t.id}-${row.key}`}><td>{t.name} · {t.roomNumber}</td><td>{t.moveInDate || "Not recorded"}</td><td>{monthLabel(row.key)}</td><td>{row.dueDate.toLocaleDateString("en-IN")}</td><td>{money(row.rent)}</td><td>{money(row.paid)}</td><td>{money(row.pendingVerification)}</td><td className={row.balance ? "ss-pending-text" : "ss-paid-text"}>{money(row.balance)}</td><td className={arrears ? "ss-pending-text" : "ss-paid-text"}>{money(arrears)}</td></tr>; }); })}</tbody></table></div> : <p className="ss-muted">Add tenants to start monthly rent tracking.</p>}
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({ label, value, hint, icon, tone }) {
  return <div className={`ss-stat-card ${tone === "amber" ? "ss-stat-amber" : ""}`}><div className="ss-stat-top"><span>{label}</span><span className="ss-stat-icon">{icon}</span></div><strong className="ss-stat-value">{value}</strong><small>{hint}</small></div>;
}

function PropertyCard({ property, onOpen, onEdit, onMap, onDelete }) {
  const roomCount = (property.rooms || []).length;
  const tenants = (property.rooms || []).reduce((sum, room) => sum + (room.tenants || []).length, 0);
  const capacity = (property.rooms || []).reduce((sum, room) => sum + Number(room.sharing || 1), 0);
  return <article className="ss-property-card"><div className="ss-property-card-art">{property.photos?.[0] ? <img src={property.photos[0]} alt={`${property.name} photo`} style={{width:"100%",height:"100%",objectFit:"cover",cursor:"pointer"}} onClick={() => window.open(property.photos[0], "_blank", "noopener,noreferrer")} /> : <span className="ss-property-art-icon">⌂</span>}<span className="ss-property-badge">{roomCount} rooms</span></div><div className="ss-property-card-body"><h3>{property.name}</h3><p className="ss-property-location">⌖ {[property.area, property.city].filter(Boolean).join(", ") || "Location not added"}</p><div className="ss-property-metrics"><div><strong>{roomCount}</strong><span>Rooms</span></div><div><strong>{tenants}</strong><span>Tenants</span></div><div><strong>{Math.max(0, capacity - tenants)}</strong><span>Beds free</span></div></div><div className="ss-property-card-actions"><button className="ss-btn ss-btn-primary" onClick={onOpen}>Manage property →</button><button className="ss-btn ss-btn-light ss-btn-small" onClick={onEdit}>✎ Edit</button><button className="ss-icon-btn" title="Open map" onClick={onMap}>↗</button><button className="ss-btn ss-btn-danger-outline ss-btn-small" onClick={onDelete}>Delete</button></div></div></article>;
}

function FormSection({ number, title, subtitle, children }) {
  return <section className="ss-form-section"><div className="ss-form-section-heading"><span>{number}</span><div><h2>{title}</h2><p>{subtitle}</p></div></div><div className="ss-form-section-content">{children}</div></section>;
}

function RoomTile({ room }) {
  const full = room.tenants.length >= room.sharing;
  return <div className="ss-room-tile">{room.photoData && <img className="ss-room-tile-photo" src={room.photoData} alt={`Room ${room.number}`} onClick={() => window.open(room.photoData, "_blank", "noopener,noreferrer")} title="Click to view room photo" />}<div><strong>{room.number}</strong><span>{room.sharing} sharing</span></div><span className={`ss-pill ${full ? "ss-pill-full" : "ss-pill-open"}`}>{full ? "Full" : `${room.sharing - room.tenants.length} free`}</span><div className="ss-progress"><span style={{ width: `${Math.min(100, room.tenants.length / room.sharing * 100)}%` }} /></div></div>;
}

function EmptyInline({ text, buttonText, onClick }) {
  return <div className="ss-empty-inline"><span className="ss-empty-inline-icon">＋</span><p>{text}</p>{buttonText && onClick && <button className="ss-btn ss-btn-light ss-btn-small" onClick={onClick}>{buttonText} →</button>}</div>;
}
