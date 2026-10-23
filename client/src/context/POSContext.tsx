import React, { createContext, useContext, useState, useEffect } from 'react';
import { Product, CartItem, Customer } from '../types';

interface POSContextType {
  cart: CartItem[];
  selectedCustomer: Customer;
  setSelectedCustomer: (c: Customer) => void;
  addItemToCart: (product: Product, qty?: number) => void;
  updateItemQuantity: (productId: string, qty: number) => void;
  updateItemDiscount: (productId: string, discount: number) => void;
  removeItemFromCart: (productId: string) => void;
  clearCart: () => void;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
  totalItemsCount: number;
  activeHeldBillId: string | null;
  setActiveHeldBillId: (id: string | null) => void;
  restoreHeldCart: (cartData: any, heldId: string, customer?: any) => void;
  playBeep: (type?: 'success' | 'error' | 'cash') => void;
}

const defaultCustomer: Customer = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Walk-in Customer',
  phone: '0000000000'
};

const POSContext = createContext<POSContextType | undefined>(undefined);

export const POSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer>(defaultCustomer);
  const [activeHeldBillId, setActiveHeldBillId] = useState<string | null>(null);

  // Synthesize realistic supermarket barcode beep via Web Audio API
  const playBeep = (type: 'success' | 'error' | 'cash' = 'success') => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'success') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1760, ctx.currentTime); // High pitch supermarket scan chime
        gain.gain.setValueAtTime(0.12, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(320, ctx.currentTime);
        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'cash') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1046, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        osc.frequency.setValueAtTime(1318, ctx.currentTime + 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch (e) {
      // Audio context might be restricted before first gesture; fail silently
    }
  };

  const addItemToCart = (product: Product, qty: number = 1) => {
    setCart(prev => {
      const existingIdx = prev.findIndex(item => item.product.id === product.id);
      if (existingIdx >= 0) {
        const existing = prev[existingIdx];
        const newQty = existing.quantity + qty;
        const linePrice = existing.unitPrice * newQty;
        const lineDiscount = existing.discountAmount;
        const netLine = linePrice - lineDiscount;
        const taxRate = existing.taxRate;
        const taxAmount = (netLine * taxRate) / (100 + taxRate);

        const updated = [...prev];
        updated[existingIdx] = {
          ...existing,
          quantity: newQty,
          taxAmount,
          lineTotal: netLine
        };
        return updated;
      } else {
        const unitPrice = Number(product.selling_price);
        const mrp = Number(product.mrp);
        const taxRate = Number(product.tax_rate || 0);
        const linePrice = unitPrice * qty;
        const taxAmount = (linePrice * taxRate) / (100 + taxRate);

        return [
          ...prev,
          {
            product,
            quantity: qty,
            unitPrice,
            mrp,
            discountAmount: 0,
            taxRate,
            taxAmount,
            lineTotal: linePrice
          }
        ];
      }
    });

    playBeep('success');
  };

  const updateItemQuantity = (productId: string, qty: number) => {
    if (qty <= 0) {
      removeItemFromCart(productId);
      return;
    }

    setCart(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          const linePrice = item.unitPrice * qty;
          const netLine = linePrice - item.discountAmount;
          const taxAmount = (netLine * item.taxRate) / (100 + item.taxRate);
          return {
            ...item,
            quantity: qty,
            taxAmount,
            lineTotal: netLine
          };
        }
        return item;
      })
    );
  };

  const updateItemDiscount = (productId: string, discount: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.product.id === productId) {
          const linePrice = item.unitPrice * item.quantity;
          const safeDiscount = Math.min(linePrice, Math.max(0, discount));
          const netLine = linePrice - safeDiscount;
          const taxAmount = (netLine * item.taxRate) / (100 + item.taxRate);
          return {
            ...item,
            discountAmount: safeDiscount,
            taxAmount,
            lineTotal: netLine
          };
        }
        return item;
      })
    );
  };

  const removeItemFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setSelectedCustomer(defaultCustomer);
    setActiveHeldBillId(null);
  };

  const restoreHeldCart = (cartData: any, heldId: string, customer?: any) => {
    setCart(cartData);
    setActiveHeldBillId(heldId);
    if (customer) {
      setSelectedCustomer(customer);
    }
  };

  // Calculations
  const subtotal = cart.reduce((acc, item) => acc + (item.unitPrice * item.quantity), 0);
  const discountTotal = cart.reduce((acc, item) => acc + item.discountAmount, 0);
  const taxTotal = cart.reduce((acc, item) => acc + item.taxAmount, 0);
  const totalItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  const rawGrandTotal = subtotal - discountTotal;
  const roundedGrand = Math.round(rawGrandTotal);
  const roundOff = Number((roundedGrand - rawGrandTotal).toFixed(2));
  const grandTotal = roundedGrand;

  return (
    <POSContext.Provider
      value={{
        cart,
        selectedCustomer,
        setSelectedCustomer,
        addItemToCart,
        updateItemQuantity,
        updateItemDiscount,
        removeItemFromCart,
        clearCart,
        subtotal,
        discountTotal,
        taxTotal,
        roundOff,
        grandTotal,
        totalItemsCount,
        activeHeldBillId,
        setActiveHeldBillId,
        restoreHeldCart,
        playBeep
      }}
    >
      {children}
    </POSContext.Provider>
  );
};

export const usePOS = () => {
  const context = useContext(POSContext);
  if (!context) {
    throw new Error('usePOS must be used within a POSProvider');
  }
  return context;
};
