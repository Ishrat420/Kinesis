export const documents = [
  {
    id: "passport",
    name: "Passport",
    type: "Identity Document",
    expiry: "12 Sep 2026",
    status: "Expiring soon",
  },
  {
    id: "driver-licence",
    name: "Driver Licence",
    type: "Identity Document",
    expiry: "03 May 2028",
    status: "Active",
  },
  {
    id: "car-insurance",
    name: "Car Insurance",
    type: "Vehicle",
    expiry: "30 Jun 2025",
    status: "Needs attention",
  },
];

export const documentDetails = {
  passport: {
    id: "passport",
    name: "Passport",
    type: "Identity Document",
    status: "Expiring soon",
    expiryDate: "12 Sep 2026",
    issueDate: "12 Sep 2016",
    owner: "Ishrat",
    documentNumber: "P1234567",
    country: "Australia",
  },
  "driver-licence": {
    id: "driver-licence",
    name: "Driver Licence",
    type: "Identity Document",
    status: "Active",
    expiryDate: "03 May 2028",
    issueDate: "03 May 2023",
    owner: "Ishrat",
    documentNumber: "D9876543",
    country: "Australia",
  },
  "car-insurance": {
    id: "car-insurance",
    name: "Car Insurance",
    type: "Vehicle",
    status: "Needs attention",
    expiryDate: "30 Jun 2025",
    issueDate: "30 Jun 2024",
    owner: "Ishrat",
    documentNumber: "POL-445829",
    country: "Australia",
  },
};

export const documentRelationships = {
  passport: [
    { type: "owner", label: "Owner", value: "Ishrat" },
    { type: "reminder", label: "Reminder", value: "Renew 6 months before expiry" },
    { type: "goal", label: "Linked goal", value: "Japan Trip" },
  ],
  "driver-licence": [
    { type: "owner", label: "Owner", value: "Ishrat" },
    { type: "reminder", label: "Reminder", value: "Renew 3 months before expiry" },
  ],
  "car-insurance": [
    { type: "vehicle", label: "Vehicle", value: "Toyota Corolla" },
    { type: "reminder", label: "Reminder", value: "Renew before expiry" },
  ],
};

export const documentTimeline = {
  passport: [
    { title: "Document uploaded", date: "2 Jul 2026" },
    { title: "Expiry reminder created", date: "2 Jul 2026" },
    { title: "AI extracted metadata", date: "2 Jul 2026" },
  ],
  "driver-licence": [
    { title: "Document uploaded", date: "2 Jul 2026" },
    { title: "Expiry reminder created", date: "2 Jul 2026" },
  ],
  "car-insurance": [
    { title: "Document uploaded", date: "2 Jul 2026" },
    { title: "Linked to Toyota Corolla", date: "2 Jul 2026" },
  ],
};