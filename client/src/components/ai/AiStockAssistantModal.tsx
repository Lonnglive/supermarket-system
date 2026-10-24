import React, { useState, useRef, useEffect } from 'react';
import { api } from '../../api/client';
import { AiChatMessage, ProposedAdjustment } from '../../types';
import {
  Sparkles, Send, Upload, X, CheckCircle2,
  Maximize2, Minimize2, Trash2, ArrowRight,
  FileText, AlertTriangle, Layers,
  Loader2, GripVertical
} from 'lucide-react';
import './ai-assistant.css';

interface AiStockAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

export const AiStockAssistantModal: React.FC<AiStockAssistantModalProps> = ({
  isOpen,
  onClose,
  onOpen
}) => {
  // Enabled/Disabled preference from settings
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    try {
      const val = localStorage.getItem('aeropos_ai_floating_enabled');
      return val === null ? true : val === 'true';
    } catch {
      return true;
    }
  });

  // Draggable FAB position
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(() => {
    try {
      const saved = localStorage.getItem('aeropos_ai_fab_pos');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  });

  // Draggable Modal position
  const [modalPos, setModalPos] = useState<{ x: number; y: number } | null>(null);

  const isDraggingFab = useRef(false);
  const fabDragStart = useRef({ startX: 0, startY: 0, initX: 0, initY: 0, moved: false });

  const isDraggingModal = useRef(false);
  const modalDragStart = useRef({ startX: 0, startY: 0, initX: 0, initY: 0 });

  useEffect(() => {
    const handleSettingsChange = () => {
      try {
        const val = localStorage.getItem('aeropos_ai_floating_enabled');
        setIsEnabled(val === null ? true : val === 'true');
      } catch {}
    };
    const handleResetPos = () => {
      localStorage.removeItem('aeropos_ai_fab_pos');
      setFabPos(null);
      setModalPos(null);
    };
    window.addEventListener('aeropos_ai_settings_changed', handleSettingsChange);
    window.addEventListener('aeropos_ai_reset_pos', handleResetPos);
    return () => {
      window.removeEventListener('aeropos_ai_settings_changed', handleSettingsChange);
      window.removeEventListener('aeropos_ai_reset_pos', handleResetPos);
    };
  }, []);

  const handleFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    fabDragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: rect.left,
      initY: rect.top,
      moved: false
    };
    isDraggingFab.current = true;
    try {
      btn.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingFab.current) return;
    const dx = e.clientX - fabDragStart.current.startX;
    const dy = e.clientY - fabDragStart.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      fabDragStart.current.moved = true;
    }
    const btn = e.currentTarget;
    const w = btn.offsetWidth || 180;
    const h = btn.offsetHeight || 50;
    const newX = Math.min(Math.max(10, fabDragStart.current.initX + dx), window.innerWidth - w - 10);
    const newY = Math.min(Math.max(10, fabDragStart.current.initY + dy), window.innerHeight - h - 10);
    setFabPos({ x: newX, y: newY });
  };

  const handleFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!isDraggingFab.current) return;
    isDraggingFab.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (fabDragStart.current.moved) {
      setFabPos(current => {
        if (current) localStorage.setItem('aeropos_ai_fab_pos', JSON.stringify(current));
        return current;
      });
    }
  };

  const handleHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const container = e.currentTarget.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    modalDragStart.current = {
      startX: e.clientX,
      startY: e.clientY,
      initX: rect.left,
      initY: rect.top
    };
    isDraggingModal.current = true;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handleHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingModal.current) return;
    const dx = e.clientX - modalDragStart.current.startX;
    const dy = e.clientY - modalDragStart.current.startY;
    const newX = Math.max(10, Math.min(window.innerWidth - 320, modalDragStart.current.initX + dx));
    const newY = Math.max(10, Math.min(window.innerHeight - 200, modalDragStart.current.initY + dy));
    setModalPos({ x: newX, y: newY });
  };

  const handleHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingModal.current) return;
    isDraggingModal.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'assistant',
      text: "👋 Hello! I'm your **AeroAI Stock Assistant** powered by Google Gemini Vision.\n\nYou can upload photos of **handwritten inventory notes** (like *'stock buble gum -5 qnty'*), damage memos, or restock slips. I will decipher the handwriting, match products against your store catalog, and update stock directly into the database ledger!",
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);

  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ data: string; mimeType: string; name: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom of messages
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, isLoading]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : inputText).trim();
    if (!text && !selectedImage) return;

    const userMessageId = `user-${Date.now()}`;
    const newMsg: AiChatMessage = {
      id: userMessageId,
      sender: 'user',
      text: text || (selectedImage ? 'Uploaded handwritten note for stock adjustment' : ''),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      imagePreview: selectedImage ? selectedImage.data : undefined
    };

    setMessages(prev => [...prev, newMsg]);
    setInputText('');
    const imagePayload = selectedImage ? { data: selectedImage.data, mimeType: selectedImage.mimeType } : undefined;
    setSelectedImage(null);
    setIsLoading(true);

    try {
      // Build conversation history
      const history = messages.slice(-6).map(m => ({
        role: (m.sender === 'assistant' ? 'assistant' : 'user') as 'assistant' | 'user',
        content: m.text
      }));

      const res = await api.ai.chat({
        message: text,
        image: imagePayload,
        history
      });

      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        sender: 'assistant',
        text: res.reply,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        extractedItems: res.extractedItems,
        action: res.action,
        applied: false
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          sender: 'assistant',
          text: `⚠️ **Error processing request**: ${err.message || 'Could not communicate with AI service.'}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (e.g. JPG, PNG, WEBP).');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage({
        data: reader.result as string,
        mimeType: file.type,
        name: file.name
      });
    };
    reader.readAsDataURL(file);
  };

  const handleApplyAdjustment = async (msgId: string, items: ProposedAdjustment[]) => {
    const validItems = items.filter(it => it.matchedProductId);
    if (validItems.length === 0) {
      alert('None of the extracted items are linked to existing catalog products.');
      return;
    }

    setIsApplying(true);
    try {
      const payload = validItems.map(it => ({
        productId: it.matchedProductId!,
        changeQuantity: it.changeQuantity,
        newQuantity: it.newStock,
        adjustmentType: it.adjustmentType,
        reason: it.reason
      }));

      const res = await api.ai.applyAdjustments(payload);

      // Mark the message as applied
      setMessages(prev =>
        prev.map(m =>
          m.id === msgId
            ? {
                ...m,
                applied: true,
                appliedDocumentNumber: res.results[0]?.adjustmentNumber
              }
            : m
        )
      );

      // Append confirmation
      const docNumbers = (res.results || []).map((r: any) => r.adjustmentNumber).join(', ');
      setMessages(prev => [
        ...prev,
        {
          id: `ai-confirm-${Date.now()}`,
          sender: 'assistant',
          text: `✅ **Stock successfully updated in database!**\n\n• Document Sequence: **${docNumbers}**\n• Updated ledger balances and logged audit trail.\n• Live inventory counters across Billing & Stock modules have been refreshed.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);

      // Fire global event to refresh any open stock or billing view
      window.dispatchEvent(new CustomEvent('aeropos_stock_updated', { detail: res }));
    } catch (err: any) {
      alert(`Failed to update stock: ${err.message}`);
    } finally {
      setIsApplying(false);
    }
  };

  const handleClearChat = () => {
    setMessages([
      {
        id: 'welcome-reset',
        sender: 'assistant',
        text: 'Chat cleared. How can I help you manage your supermarket inventory today?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
  };

  if (!isEnabled && !isOpen) {
    return null;
  }

  return (
    <>
      {/* Persistent Floating Action Button when closed (Draggable anywhere on screen) */}
      {!isOpen && isEnabled && (
        <button
          id="btn-open-ai-assistant"
          className="ai-assistant-fab"
          style={{
            touchAction: 'none',
            userSelect: 'none',
            cursor: isDraggingFab.current ? 'grabbing' : 'grab',
            ...(fabPos ? { left: `${fabPos.x}px`, top: `${fabPos.y}px`, right: 'auto', bottom: 'auto' } : {})
          }}
          onPointerDown={handleFabPointerDown}
          onPointerMove={handleFabPointerMove}
          onPointerUp={handleFabPointerUp}
          onClick={(e) => {
            if (fabDragStart.current.moved) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            onOpen();
          }}
          title="Drag to reposition • Click to open AeroAI Stock Assistant"
        >
          <GripVertical size={14} style={{ opacity: 0.65, marginRight: -2 }} />
          <Sparkles size={18} color="#ffffff" />
          <span>AeroAI Copilot</span>
          <span className="ai-assistant-fab-badge">Vision AI</span>
        </button>
      )}

      {/* Modal Dialog (Draggable by Header) */}
      {isOpen && (
        <div
          className="ai-modal-overlay"
          onClick={onClose}
          style={modalPos ? { alignItems: 'flex-start', justifyContent: 'flex-start', padding: 0 } : undefined}
        >
          <div
            className={`ai-modal-container ${isExpanded ? 'expanded' : ''}`}
            onClick={e => e.stopPropagation()}
            style={modalPos ? { position: 'fixed', left: `${modalPos.x}px`, top: `${modalPos.y}px`, margin: 0 } : undefined}
          >
            {/* Header - Drag Handle */}
            <div
              className="ai-header"
              style={{ cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
              onPointerDown={handleHeaderPointerDown}
              onPointerMove={handleHeaderPointerMove}
              onPointerUp={handleHeaderPointerUp}
              title="Click & drag header to reposition window"
            >
              <div className="ai-header-brand">
                <GripVertical size={16} style={{ opacity: 0.5, marginRight: 2 }} />
                <div className="ai-avatar">
                  <Sparkles size={20} />
                </div>
                <div>
                  <div className="ai-header-title">
                    <span>AeroAI Stock Assistant</span>
                  </div>
                  <div className="ai-header-status">
                    <span className="ai-status-dot" />
                    <span>Gemini 3.8 Multimodal • Ready</span>
                  </div>
                </div>
              </div>

              <div className="ai-header-actions">
                <button
                  className="ai-icon-btn"
                  onClick={handleClearChat}
                  title="Clear conversation"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  className="ai-icon-btn"
                  onClick={() => setIsExpanded(!isExpanded)}
                  title={isExpanded ? 'Restore compact' : 'Expand window'}
                >
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
                <button
                  className="ai-icon-btn"
                  onClick={onClose}
                  title="Close Assistant"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages Area */}
            <div className="ai-messages-area">
              {messages.map(msg => (
                <div key={msg.id} className={`ai-msg ${msg.sender}`}>
                  {msg.imagePreview && (
                    <div className="ai-msg-image-preview">
                      <img src={msg.imagePreview} alt="Handwritten note upload" />
                    </div>
                  )}

                  <div className="ai-msg-bubble">
                    <div style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</div>

                    {/* Extracted Adjustments Card */}
                    {msg.extractedItems && msg.extractedItems.length > 0 && (
                      <div className="ai-adjustment-card">
                        <div className="ai-adj-header">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <FileText size={15} color="#38bdf8" />
                            <span style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc' }}>
                              Proposed Stock Updates ({msg.extractedItems.length})
                            </span>
                          </div>
                          <span className={`ai-adj-badge ${msg.applied ? 'applied' : 'ready'}`}>
                            {msg.applied ? `Applied #${msg.appliedDocumentNumber || 'ADJ'}` : 'Pending Confirmation'}
                          </span>
                        </div>

                        {msg.extractedItems.map((item: ProposedAdjustment, idx: number) => (
                          <div key={idx} className="ai-adj-item-row">
                            <div>
                              <div className="ai-adj-item-name">
                                {item.matchedProductName || item.rawItem}
                              </div>
                              <div className="ai-adj-item-sub">
                                Note: &ldquo;{item.rawItem}&rdquo; • Type: {item.adjustmentType}
                              </div>
                            </div>

                            <div className="ai-adj-stock-flow">
                              <span className="ai-adj-old">{item.currentStock}</span>
                              <ArrowRight size={13} className="ai-adj-arrow" />
                              <span className="ai-adj-new">{item.newStock}</span>
                              <span
                                className={`ai-adj-delta ${item.changeQuantity < 0 ? 'negative' : 'positive'}`}
                              >
                                {item.changeQuantity > 0 ? `+${item.changeQuantity}` : item.changeQuantity}
                              </span>
                            </div>
                          </div>
                        ))}

                        {!msg.applied ? (
                          <button
                            className="ai-adj-apply-btn"
                            disabled={isApplying}
                            onClick={() => handleApplyAdjustment(msg.id, msg.extractedItems!)}
                          >
                            {isApplying ? (
                              <>
                                <Loader2 size={16} className="spin" />
                                <span>Updating Inventory Ledger...</span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 size={16} />
                                <span>Confirm & Apply to Inventory</span>
                              </>
                            )}
                          </button>
                        ) : (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 8,
                            padding: '8px 0',
                            color: '#10b981',
                            fontSize: 12.5,
                            fontWeight: 600
                          }}>
                            <CheckCircle2 size={15} />
                            <span>Stock Adjustment Applied to Database</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <span className="ai-msg-time">{msg.timestamp}</span>
                </div>
              ))}

              {isLoading && (
                <div className="ai-msg assistant">
                  <div className="ai-msg-bubble" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Loader2 size={18} color="#10b981" style={{ animation: 'spin 1s linear infinite' }} />
                    <span style={{ color: '#94a3b8', fontSize: 13 }}>
                      Deciphering note & analyzing supermarket stock catalog...
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick Action Suggestion Chips */}
            <div className="ai-quick-prompts">
              <button
                className="ai-quick-btn"
                onClick={() => handleSendMessage('stock buble gum -5 qnty')}
              >
                <span>📝 &ldquo;stock buble gum -5 qnty&rdquo;</span>
              </button>
              <button
                className="ai-quick-btn"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={12} />
                <span>Upload Handwritten Note</span>
              </button>
              <button
                className="ai-quick-btn"
                onClick={() => handleSendMessage('Which products are low in stock right now?')}
              >
                <AlertTriangle size={12} color="#f59e0b" />
                <span>Low Stock Items</span>
              </button>
              <button
                className="ai-quick-btn"
                onClick={() => handleSendMessage('Give me a brief summary of total stock valuation and inventory health.')}
              >
                <Layers size={12} color="#38bdf8" />
                <span>Stock Valuation</span>
              </button>
            </div>

            {/* Selected Image Thumbnail Preview before sending */}
            {selectedImage && (
              <div className="ai-pending-image-preview">
                <img src={selectedImage.data} alt="Pending note" className="ai-preview-thumb" />
                <div className="ai-preview-info">
                  <strong>Attached Note:</strong> {selectedImage.name}
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>
                    Click Send or add extra notes before submitting.
                  </div>
                </div>
                <button
                  className="ai-preview-remove"
                  onClick={() => setSelectedImage(null)}
                  title="Remove attachment"
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Input Form */}
            <form
              className="ai-input-area"
              onSubmit={e => {
                e.preventDefault();
                handleSendMessage();
              }}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: 'none' }}
                accept="image/*"
                onChange={handleFileUpload}
              />

              <button
                type="button"
                className="ai-upload-btn"
                title="Upload Handwritten Note or Photo"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload size={18} />
              </button>

              <input
                type="text"
                className="ai-text-input"
                placeholder={
                  selectedImage
                    ? 'Add optional prompt (or press Enter to analyze note)...'
                    : 'Type a stock note, e.g. "stock buble gum -5 qnty"...'
                }
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                disabled={isLoading}
              />

              <button
                type="submit"
                className="ai-send-btn"
                disabled={(!inputText.trim() && !selectedImage) || isLoading}
                title="Send to AeroAI Assistant"
              >
                {isLoading ? <Loader2 size={18} className="spin" /> : <Send size={18} />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
