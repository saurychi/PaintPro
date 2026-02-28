'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { X, Plus } from 'lucide-react';
import { InventoryItem } from '@/lib/inventoryitem';

export interface PendingItem extends Omit<InventoryItem, 'dateCreated' | 'lastUpdated' | 'id'> {
  tempId: string;
}

interface BulkCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function BulkCreateModal({ isOpen, onClose }: BulkCreateModalProps) {
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    unitCost: '',
    inStock: '',
    supplier: '',
    location: '',
    additionalInfo: '',
  });

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleAddToQueue = () => {
    // Validate required fields
    if (!formData.name || !formData.category || !formData.unitCost || !formData.inStock) {
      alert('Please fill in all required fields');
      return;
    }

    const newItem: PendingItem = {
      tempId: `temp-${Date.now()}`,
      name: formData.name,
      unitType: formData.category,
      unitCost: parseFloat(formData.unitCost),
      inStock: parseInt(formData.inStock),
      location: formData.location,
      supplier: formData.supplier,
    };

    setPendingItems((prev) => [...prev, newItem]);

    // Reset form
    setFormData({
      name: '',
      category: '',
      unitCost: '',
      inStock: '',
      supplier: '',
      location: '',
      additionalInfo: '',
    });
  };

  const handleRemoveItem = (tempId: string) => {
    setPendingItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleSubmitAll = () => {
    if (pendingItems.length === 0) {
      alert('Add at least one material to submit');
      return;
    }

    // Mock: console.log the final queue
    console.log('[v0] Submitting bulk items:', pendingItems);

    // Mock success feedback
    alert(`Successfully queued ${pendingItems.length} material(s) for creation!`);

    // Reset and close
    setPendingItems([]);
    setFormData({
      name: '',
      category: '',
      unitCost: '',
      inStock: '',
      supplier: '',
      location: '',
      additionalInfo: '',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="text-2xl flex items-center gap-2">
              <Plus className="w-6 h-6" />
              Add New Material
            </DialogTitle>
            <Button
              variant="default"
              className="bg-green-500 hover:bg-green-600"
              onClick={handleAddToQueue}
            >
              + New Material
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Form Section */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-semibold mb-4">New Material</h3>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name:
                </label>
                <Input
                  name="name"
                  placeholder="New Material 1"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full"
                />
              </div>

              {/* Unit Cost */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Cost (AUS):
                </label>
                <Input
                  name="unitCost"
                  type="number"
                  step="0.01"
                  placeholder="$0.00"
                  value={formData.unitCost}
                  onChange={handleInputChange}
                  className="w-full"
                />
              </div>

              {/* Current In Stock */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Current In Stock:
                </label>
                <Input
                  name="inStock"
                  type="number"
                  placeholder="0"
                  value={formData.inStock}
                  onChange={handleInputChange}
                  className="w-full"
                />
              </div>

              {/* Material Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Material Type:
                </label>
                <Input
                  name="category"
                  placeholder="Type"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full"
                />
              </div>

              {/* Supplier */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier:
                </label>
                <Input
                  name="supplier"
                  placeholder="Supplier Co."
                  value={formData.supplier}
                  onChange={handleInputChange}
                  className="w-full"
                />
              </div>

              {/* Location Stored */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location Stored:
                </label>
                <Input
                  name="location"
                  placeholder="Location A"
                  value={formData.location}
                  onChange={handleInputChange}
                  className="w-full"
                />
              </div>

              {/* Additional Information */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Information (Optional):
                </label>
                <div className="text-xs text-gray-500 mb-2">0/1000</div>
                <Textarea
                  name="additionalInfo"
                  placeholder="Description here..."
                  value={formData.additionalInfo}
                  onChange={handleInputChange}
                  className="w-full h-32 resize-none"
                />
              </div>
            </div>

            {/* Add Material Button */}
            <Button
              onClick={handleAddToQueue}
              className="w-full mt-6 bg-green-500 hover:bg-green-600"
            >
              + Add Material
            </Button>
          </div>

          {/* Queue Display Section */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200 min-h-32">
            <h3 className="text-lg font-semibold mb-4">Pending Items</h3>

            {pendingItems.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-gray-400">
                <p>No Materials To Be Added...</p>
              </div>
            ) : (
              <div className="space-y-2">
                {pendingItems.map((item) => (
                  <div
                    key={item.tempId}
                    className="flex items-center justify-between bg-white p-4 rounded-lg border border-gray-200 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-center gap-3">
                      <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                      <span className="font-medium text-gray-900">{item.name}</span>
                    </div>
                    <button
                      onClick={() => handleRemoveItem(item.tempId)}
                      className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                      aria-label="Remove item"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmitAll}
            disabled={pendingItems.length === 0}
            className="bg-green-500 hover:bg-green-600 disabled:opacity-50"
          >
            + Add All Materials
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Simple Chevron Right Icon component
function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}
