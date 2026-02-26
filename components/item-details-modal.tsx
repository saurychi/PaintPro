'use client';

import { useState } from 'react';
import { InventoryItem } from '@/lib/inventoryitem';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Trash2 } from 'lucide-react';

interface ItemDetailsModalProps {
  selectedItem: InventoryItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (item: InventoryItem) => void;
  onDelete?: (itemId: string) => void;
}

export function ItemDetailsModal({
  selectedItem,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: ItemDetailsModalProps) {
  const [isEditMode, setIsEditMode] = useState(false);
  const [editData, setEditData] = useState<InventoryItem | null>(null);

  if (!selectedItem) return null;

  const displayData = isEditMode && editData ? editData : selectedItem;

  const handleEditClick = () => {
    setIsEditMode(true);
    setEditData({ ...selectedItem });
  };

  const handleCancel = () => {
    setIsEditMode(false);
    setEditData(null);
  };

  const handleSave = () => {
    if (editData && onSave) {
      onSave(editData);
    }
    setIsEditMode(false);
    setEditData(null);
  };

  const handleInputChange = (field: keyof InventoryItem, value: any) => {
    if (editData) {
      setEditData({
        ...editData,
        [field]: value,
      });
    }
  };

  const handleDelete = () => {
    if (onDelete) {
      onDelete(selectedItem.id);
    }
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-semibold">
              {displayData.name}
            </DialogTitle>
            {!isEditMode && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleEditClick}
                className="bg-gray-200 hover:bg-gray-300 text-gray-700"
              >
                Edit Material
              </Button>
            )}
          </div>

          {isEditMode && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                className="flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
              <Button
                onClick={handleSave}
                className="ml-auto bg-green-500 hover:bg-green-600 text-white"
              >
                Accept Changes
              </Button>
            </div>
          )}
        </DialogHeader>

        <div className="space-y-6">
          {/* Material ID - Always Read Only */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Material ID:
            </Label>
            {isEditMode ? (
              <Input
                value={displayData.id}
                disabled
                className="bg-gray-100 text-gray-600 cursor-not-allowed"
              />
            ) : (
              <p className="text-gray-900">{displayData.id}</p>
            )}
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm font-medium text-gray-700">
              Name:
            </Label>
            {isEditMode ? (
              <Input
                id="name"
                value={editData?.name || ''}
                onChange={(e) => handleInputChange('name', e.target.value)}
                className="border-gray-300"
              />
            ) : (
              <p className="text-gray-900">{displayData.name}</p>
            )}
          </div>

          {/* Unit Cost */}
          <div className="space-y-2">
            <Label
              htmlFor="unitCost"
              className="text-sm font-medium text-gray-700"
            >
              Unit Cost (AUS$):
            </Label>
            {isEditMode ? (
              <Input
                id="unitCost"
                type="number"
                value={editData?.unitCost || ''}
                onChange={(e) =>
                  handleInputChange('unitCost', parseFloat(e.target.value))
                }
                className="border-gray-300"
                step="0.01"
              />
            ) : (
              <p className="text-gray-900">${displayData.unitCost.toFixed(2)}</p>
            )}
          </div>

          {/* In Stock */}
          <div className="space-y-2">
            <Label
              htmlFor="inStock"
              className="text-sm font-medium text-gray-700"
            >
              Current In Stock:
            </Label>
            {isEditMode ? (
              <Input
                id="inStock"
                type="number"
                value={editData?.inStock || ''}
                onChange={(e) =>
                  handleInputChange('inStock', parseInt(e.target.value))
                }
                className="border-gray-300"
              />
            ) : (
              <p className="text-gray-900">{displayData.inStock}</p>
            )}
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label
              htmlFor="category"
              className="text-sm font-medium text-gray-700"
            >
              Material Type:
            </Label>
            {isEditMode ? (
              <Input
                id="category"
                value={editData?.unitType || ''}
                onChange={(e) => handleInputChange('unitType', e.target.value)}
                className="border-gray-300"
              />
            ) : (
              <p className="text-gray-900">{displayData.unitType}</p>
            )}
          </div>

          {/* Supplier */}
          <div className="space-y-2">
            <Label
              htmlFor="supplier"
              className="text-sm font-medium text-gray-700"
            >
              Supplier:
            </Label>
            {isEditMode ? (
              <Input
                id="supplier"
                value={editData?.supplier || ''}
                onChange={(e) => handleInputChange('supplier', e.target.value)}
                className="border-gray-300"
              />
            ) : (
              <p className="text-gray-900">{displayData.supplier}</p>
            )}
          </div>

          {/* Date Created - Always Read Only */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Date Added:
            </Label>
            {isEditMode ? (
              <Input
                value={new Date(displayData.dateCreated).toLocaleDateString(
                  'en-US',
                  {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  }
                )}
                disabled
                className="bg-gray-100 text-gray-600 cursor-not-allowed"
              />
            ) : (
              <p className="text-gray-900">
                {new Date(displayData.dateCreated).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            )}
          </div>

          {/* Additional Information */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              Additional Information (Optional):
            </Label>
            {isEditMode ? (
              <Textarea
                placeholder="Enter additional notes..."
                className="border-gray-300 min-h-32"
                defaultValue="• These paint cans are meant for walls\n• Bought at discounted price"
              />
            ) : (
              <div className="text-gray-900 space-y-2 text-sm">
                <p className="text-gray-600">
                  • These paint cans are meant for walls
                </p>
                <p className="text-gray-600">• Bought at discounted price</p>
              </div>
            )}
          </div>
        </div>

        {/* Cancel and Save Footer for Edit Mode */}
        {isEditMode && (
          <div className="flex gap-2 justify-end pt-6 border-t">
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-green-500 hover:bg-green-600 text-white"
            >
              Save Changes
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
