/**
 * Inventory System Data Types and Mock Data
 */

export type InventoryItem = {
  id: string;
  name: string;
  unitType: string;
  unitCost: number;
  inStock: number;
  supplier: string;
  location: string;
  dateCreated: string;
  lastUpdated: string;
};

export const MOCK_MATERIALS: InventoryItem[] = [
  {
    id: "INV001",
    name: "Stainless Steel Fastener Kit",
    unitType: "Hardware",
    unitCost: 45.99,
    inStock: 250,
    supplier: "Pacific Industrial Supply",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-01-15",
    lastUpdated: "2025-02-20",
  },
  {
    id: "INV002",
    name: "Premium Cotton Fabric Roll",
    unitType: "Textiles",
    unitCost: 28.50,
    inStock: 75,
    supplier: "Global Textiles Ltd",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-03-22",
    lastUpdated: "2025-02-18",
  },
  {
    id: "INV003",
    name: "LED Lighting Module 24W",
    unitType: "Electronics",
    unitCost: 156.75,
    inStock: 42,
    supplier: "TechCore Components",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-05-10",
    lastUpdated: "2025-02-25",
  },
  {
    id: "INV004",
    name: "Polyurethane Foam Sheet (1m x 2m)",
    unitType: "Materials",
    unitCost: 72.40,
    inStock: 18,
    supplier: "EuroFoam Industries",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-02-28",
    lastUpdated: "2025-02-19",
  },
  {
    id: "INV005",
    name: "Aluminum Extrusion Profile",
    unitType: "Metals",
    unitCost: 89.25,
    inStock: 125,
    supplier: "MetalTech Solutions",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-06-12",
    lastUpdated: "2025-02-21",
  },
];
