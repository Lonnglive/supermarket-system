/**
 * ai.service.ts  –  AeroAI Stock Assistant: Gemini Vision + Inventory Intelligence
 */

import { pool } from '../config/db.js';
import { createStockAdjustment } from './inventory.service.js';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
const CANDIDATE_MODELS = Array.from(new Set([
  PRIMARY_MODEL,
  'gemini-3.8-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest'
].filter(Boolean)));
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Types
export interface ProposedAdjustment {
  rawItem: string;
  extractedName: string;
  changeQuantity: number;
  adjustmentType: 'PHYSICAL_COUNT' | 'DAMAGED' | 'EXPIRED' | 'CORRECTION';
  reason: string;
  matchedProductId?: string;
  matchedProductName?: string;
  currentStock?: number;
  newStock?: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'READY' | 'NEEDS_MATCH' | 'ERROR';
  note?: string;
}

export interface AiChatResult {
  reply: string;
  extractedItems: ProposedAdjustment[];
  action: 'PROPOSE_ADJUSTMENT' | 'GENERAL_CHAT' | 'INVENTORY_QUERY';
  rawOcrText?: string;
}

interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  current_stock: number;
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

function matchScore(query: string, productName: string): number {
  const q = query.toLowerCase().trim();
  const p = productName.toLowerCase();
  if (p.includes(q)) return 1.0;
  const qTokens = q.split(/\s+/).filter(t => t.length > 2);
  const pTokens = p.split(/\s+/);
  const overlap = qTokens.filter(qt => pTokens.some(pt => pt.includes(qt) || qt.includes(pt))).length;
  if (overlap > 0) return Math.min(0.95, 0.5 + overlap * 0.15);
  const shortProduct = pTokens.slice(0, 3).join(' ');
  const dist = levenshtein(q, shortProduct);
  const maxLen = Math.max(q.length, shortProduct.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}

async function getAllProducts(): Promise<CatalogProduct[]> {
  const res = await pool.query(
    `SELECT id, name, sku, CAST(current_stock AS FLOAT) as current_stock FROM products WHERE is_active = true ORDER BY name`
  );
  return res.rows;
}

async function getLowStockContext(): Promise<string> {
  const res = await pool.query(`
    SELECT p.name, p.current_stock, p.min_stock_level, u.name as unit
    FROM products p LEFT JOIN units u ON p.unit_id = u.id
    WHERE p.is_active = true AND p.current_stock <= p.min_stock_level
    ORDER BY p.current_stock ASC LIMIT 20
  `);
  if (res.rows.length === 0) return 'No low-stock items found.';
  return res.rows.map((r: any) => `- ${r.name}: ${r.current_stock} ${r.unit || 'units'} (min: ${r.min_stock_level})`).join('\n');
}

async function getStockValuationContext(): Promise<string> {
  const res = await pool.query(`
    SELECT COUNT(*) as total_products,
      SUM(current_stock * purchase_price) as cost_value,
      SUM(current_stock * selling_price) as retail_value,
      COUNT(*) FILTER (WHERE current_stock <= min_stock_level AND current_stock > 0) as low_stock_count,
      COUNT(*) FILTER (WHERE current_stock <= 0) as out_of_stock_count
    FROM products WHERE is_active = true
  `);
  const r = res.rows[0];
  return [
    `Total SKUs: ${r.total_products}`,
    `Stock Cost Value: Rs.${Number(r.cost_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
    `Stock Retail Value: Rs.${Number(r.retail_value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`,
    `Low Stock Items: ${r.low_stock_count}`,
    `Out of Stock Items: ${r.out_of_stock_count}`
  ].join('\n');
}

async function fuzzyMatchProduct(query: string, catalog: CatalogProduct[]): Promise<{ product: CatalogProduct; score: number } | null> {
  let best: { product: CatalogProduct; score: number } | null = null;
  for (const prod of catalog) {
    const score = matchScore(query, prod.name);
    if (!best || score > best.score) best = { product: prod, score };
  }
  return best && best.score >= 0.35 ? best : null;
}

async function callGemini(parts: any[], systemInstruction: string): Promise<string> {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured on the server.');
  const body = {
    system_instruction: { parts: [{ text: systemInstruction }] },
    contents: [{ role: 'user', parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 2048 }
  };

  let lastError: Error | null = null;
  for (const model of CANDIDATE_MODELS) {
    try {
      const url = `${GEMINI_API_BASE}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 404) {
          console.warn(`[AeroAI] Model ${model} returned 404, falling back...`);
          lastError = new Error(`Gemini API error ${response.status}: ${errText}`);
          continue;
        }
        throw new Error(`Gemini API error ${response.status}: ${errText}`);
      }
      const data = await response.json() as any;
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error('Empty response from Gemini API.');
      return text.trim();
    } catch (err: any) {
      if (err.message && err.message.includes('404')) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All candidate Gemini models failed.');
}

const EXTRACTION_SYSTEM_PROMPT = `You are an inventory management AI for a supermarket. Parse handwritten or typed inventory notes and extract structured stock adjustments.

RULES:
1. Extract every product mention with its quantity change (positive = add stock, negative = reduce stock).
2. Handle common misspellings (e.g. "buble gum" = "bubble gum", "biscut" = "biscuit").
3. Identify adjustment type: damaged/broken/spoilt -> DAMAGED; expired/expiry/old -> EXPIRED; count/physical/audit -> PHYSICAL_COUNT; default -> CORRECTION.
4. Return a JSON array ONLY. No explanations. No markdown fences.

OUTPUT FORMAT:
[{"rawItem":"<original text>","extractedName":"<corrected name>","changeQuantity":<number>,"adjustmentType":"CORRECTION|DAMAGED|EXPIRED|PHYSICAL_COUNT","reason":"<brief reason>","confidence":"HIGH|MEDIUM|LOW"}]`;

export async function processAiChat(params: {
  message?: string;
  image?: { data: string; mimeType: string };
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}): Promise<AiChatResult> {
  const { message, image } = params;
  const catalog = await getAllProducts();
  const catalogNames = catalog.slice(0, 80).map(p => p.name).join('\n');

  let ocrText = '';
  if (image) {
    const base64Data = image.data.includes(',') ? image.data.split(',')[1] : image.data;
    ocrText = await callGemini(
      [{ inlineData: { mimeType: image.mimeType, data: base64Data } }, { text: 'Transcribe all text in this image exactly as written, line by line.' }],
      'You are an OCR assistant. Return only the transcribed text.'
    );
  }

  const combinedText = [message, ocrText].filter(Boolean).join('\n').trim();
  const textLower = combinedText.toLowerCase();

  const isAdjustmentIntent =
    /\b(stock|add|remove|reduce|deduct|received|damaged|expired|adjust|qty|qnty|quantity|pieces|pcs|units)\b/.test(textLower) ||
    /[-+]\d+/.test(combinedText) ||
    image != null;

  const isInventoryQuery =
    !isAdjustmentIntent &&
    /\b(low|out of stock|valuation|value|how many|how much|inventory|health|summary|status)\b/.test(textLower);

  // Inventory query
  if (isInventoryQuery) {
    let contextData = '';
    if (/\b(low|running out|shortage|critical)\b/.test(textLower)) {
      contextData = 'LOW STOCK REPORT:\n' + (await getLowStockContext());
    } else if (/\b(valu|worth|total|cost)\b/.test(textLower)) {
      contextData = 'STOCK VALUATION:\n' + (await getStockValuationContext());
    } else {
      const [low, val] = await Promise.all([getLowStockContext(), getStockValuationContext()]);
      contextData = `VALUATION:\n${val}\n\nLOW STOCK:\n${low}`;
    }
    const reply = await callGemini(
      [{ text: `${combinedText}\n\n---\n${contextData}` }],
      'You are a supermarket inventory assistant. Answer concisely using the data provided. Use bullet points.'
    );
    return { reply, extractedItems: [], action: 'INVENTORY_QUERY' };
  }

  // Stock adjustment
  if (isAdjustmentIntent) {
    const extractParts: any[] = [];
    if (image) {
      const base64Data = image.data.includes(',') ? image.data.split(',')[1] : image.data;
      extractParts.push({ inlineData: { mimeType: image.mimeType, data: base64Data } });
    }
    extractParts.push({ text: `Parse this inventory note:\n"${combinedText}"\n\nCatalog reference (first 80):\n${catalogNames}\n\nReturn JSON array only.` });

    let rawJson = await callGemini(extractParts, EXTRACTION_SYSTEM_PROMPT);
    rawJson = rawJson.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = rawJson.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (jsonMatch) {
      rawJson = jsonMatch[0];
    }

    let extracted: any[] = [];
    try { extracted = JSON.parse(rawJson); } catch {
      return { reply: rawJson, extractedItems: [], action: 'GENERAL_CHAT', rawOcrText: ocrText || undefined };
    }

    if (!Array.isArray(extracted) || extracted.length === 0) {
      return {
        reply: `I could not extract inventory items from: "${ocrText || combinedText}"\n\nPlease ensure the note mentions product names and quantities (e.g. "Biscuits -5" or "Maggi +10").`,
        extractedItems: [],
        action: 'GENERAL_CHAT',
        rawOcrText: ocrText || undefined
      };
    }

    const proposedAdjustments: ProposedAdjustment[] = await Promise.all(
      extracted.map(async (item: any) => {
        const match = await fuzzyMatchProduct(item.extractedName, catalog);
        if (match) {
          const currentStock = match.product.current_stock;
          const changeQty = Number(item.changeQuantity);
          const newStock = Math.max(0, currentStock + changeQty);
          return {
            rawItem: item.rawItem || item.extractedName,
            extractedName: item.extractedName,
            changeQuantity: changeQty,
            adjustmentType: item.adjustmentType || 'CORRECTION',
            reason: item.reason || 'AI-extracted from handwritten note',
            matchedProductId: match.product.id,
            matchedProductName: match.product.name,
            currentStock,
            newStock,
            confidence: item.confidence || 'MEDIUM',
            status: 'READY' as const,
            note: match.score < 0.7 ? `Low confidence match (${Math.round(match.score * 100)}%)` : undefined
          };
        }
        return {
          rawItem: item.rawItem || item.extractedName,
          extractedName: item.extractedName,
          changeQuantity: Number(item.changeQuantity),
          adjustmentType: item.adjustmentType || 'CORRECTION',
          reason: item.reason || 'AI-extracted from handwritten note',
          confidence: item.confidence || 'LOW',
          status: 'NEEDS_MATCH' as const,
          note: 'Could not match to a catalog product.'
        };
      })
    );

    const matched = proposedAdjustments.filter(a => a.status === 'READY');
    const unmatched = proposedAdjustments.filter(a => a.status === 'NEEDS_MATCH');
    const summaryLines = proposedAdjustments.map(a =>
      a.status === 'READY'
        ? `- **${a.matchedProductName}**: ${a.changeQuantity < 0 ? 'DOWN' : 'UP'} ${Math.abs(a.changeQuantity)} units (${a.currentStock} -> ${a.newStock})`
        : `- Unknown: "${a.extractedName}" - not found in catalog`
    );

    let replyText =
      `I processed your note${ocrText ? ' (handwriting recognition)' : ''} and found **${extracted.length} item(s)**:\n\n` +
      summaryLines.join('\n');
    if (unmatched.length > 0) replyText += `\n\n${unmatched.length} item(s) could not be matched to catalog products.`;
    if (matched.length > 0) replyText += `\n\nReview the proposed changes below and click **"Confirm & Apply"** to update the stock ledger.`;
    else replyText += `\n\nNo items could be matched. Please verify product names or add them to the catalog.`;

    return { reply: replyText, extractedItems: proposedAdjustments, action: 'PROPOSE_ADJUSTMENT', rawOcrText: ocrText || undefined };
  }

  // General chat
  const contextData = await getStockValuationContext();
  const reply = await callGemini(
    [{ text: `${combinedText}\n\n---\nSTORE DATA:\n${contextData}` }],
    'You are AeroAI, a helpful supermarket management assistant. Answer concisely.'
  );
  return { reply, extractedItems: [], action: 'GENERAL_CHAT' };
}

export async function applyBulkAdjustments(params: {
  adjustments: Array<{
    productId: string;
    changeQuantity?: number;
    newQuantity?: number;
    adjustmentType?: 'PHYSICAL_COUNT' | 'DAMAGED' | 'EXPIRED' | 'CORRECTION';
    reason?: string;
  }>;
  userId: string;
  ipAddress?: string;
}) {
  const results = [];
  for (const adj of params.adjustments) {
    if (!adj.productId) continue;
    let resolvedNewQty: number;
    if (adj.newQuantity !== undefined) {
      resolvedNewQty = adj.newQuantity;
    } else if (adj.changeQuantity !== undefined) {
      const res = await pool.query(`SELECT current_stock FROM products WHERE id = $1`, [adj.productId]);
      if (res.rowCount === 0) continue;
      resolvedNewQty = Math.max(0, Number(res.rows[0].current_stock) + adj.changeQuantity);
    } else { continue; }

    const result = await createStockAdjustment({
      productId: adj.productId,
      newQuantity: resolvedNewQty,
      adjustmentType: adj.adjustmentType || 'CORRECTION',
      reason: adj.reason || 'Applied via AeroAI Stock Assistant',
      userId: params.userId,
      ipAddress: params.ipAddress
    });
    results.push({ ...result, productId: adj.productId, adjustmentType: adj.adjustmentType || 'CORRECTION', reason: adj.reason });
  }
  return { success: true, message: `Applied ${results.length} stock adjustment(s).`, results };
}
