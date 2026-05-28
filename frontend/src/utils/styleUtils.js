// Style and SLD helper utilities extracted from MapView.js
import { MAX_ATTRIBUTE_SLD_RULES } from './mapConstants';

const styleConfigCache = new Map();
const styleConfigPromiseCache = new Map();
const rasterListCache = new Map();
const rasterListPromiseCache = new Map();

export const loadStyleConfig = async (baseUrl) => {
  const cacheKey = `${baseUrl}/config/`;
  if (styleConfigCache.has(cacheKey)) return styleConfigCache.get(cacheKey);
  if (styleConfigPromiseCache.has(cacheKey)) return styleConfigPromiseCache.get(cacheKey);

  const request = fetch(cacheKey)
    .then(async (res) => {
      if (!res.ok) throw new Error('remote_style_load_failed');
      const json = await res.json();
      styleConfigCache.set(cacheKey, json);
      return json;
    })
    .finally(() => {
      styleConfigPromiseCache.delete(cacheKey);
    });

  styleConfigPromiseCache.set(cacheKey, request);
  return request;
};

export const loadRasterList = async (baseUrl, dataset) => {
  const cacheKey = `${baseUrl}|${dataset}`;
  if (rasterListCache.has(cacheKey)) return rasterListCache.get(cacheKey);
  if (rasterListPromiseCache.has(cacheKey)) return rasterListPromiseCache.get(cacheKey);

  const request = fetch(`${baseUrl}/list/?dataset=${encodeURIComponent(dataset)}`)
    .then(async (res) => {
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      rasterListCache.set(cacheKey, items);
      return items;
    })
    .finally(() => {
      rasterListPromiseCache.delete(cacheKey);
    });

  rasterListPromiseCache.set(cacheKey, request);
  return request;
};

export const setStyleConfigCache = (baseUrl, json) => {
  try {
    const cacheKey = `${baseUrl}/config/`;
    styleConfigCache.set(cacheKey, json);
  } catch (e) {
    // no-op
  }
};

export const normalizeSimpleStyle = (style = {}) => ({
  strokeColor: style.strokeColor || '#2563eb',
  fillColor: style.fillColor || 'rgba(37,99,235,0.2)',
  strokeWidth: Number(style.strokeWidth) || 2,
  opacity: Math.max(0, Math.min(1, Number(style.opacity) || 1)),
});

export const normalizeLayerStyle = (style = {}) => {
  const normalized = normalizeSimpleStyle(style);
  const attr = style?.attributeStyle;
  if (attr && typeof attr === 'object') {
    const field = typeof attr.field === 'string' ? attr.field : '';
    const rules = Array.isArray(attr.rules)
      ? attr.rules
        .filter((rule) => rule && typeof rule.value !== 'undefined' && rule.style)
        .map((rule, index) => ({
          id: rule.id || `${field || 'field'}-${index}`,
          value: String(rule.value),
          style: normalizeSimpleStyle(rule.style),
        }))
      : [];
    if (field && rules.length) {
      normalized.attributeStyle = {
        field,
        enabled: attr.enabled !== false,
        rules: rules.slice(0, MAX_ATTRIBUTE_SLD_RULES),
      };
    }
  }
  return normalized;
};

export const loadLocalNamedStyles = (storageKey) => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item) => item && typeof item.name === 'string' && item.style)
      .map((item) => ({ name: item.name, style: normalizeLayerStyle(item.style) }));
  } catch {
    return [];
  }
};

export const loadLocalLayerStyleMap = (storageKey) => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const loadLocalLayerSelections = (storageKey) => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const extractFillOpacity = (fillColor) => {
  const match = String(fillColor || '').match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([0-9.]+)\)/i);
  return match ? match[1] : '0.2';
};

export const symbolizersToSld = (styleConfig, geometryType = 'all') => {
  const fillOpacity = extractFillOpacity(styleConfig.fillColor);
  const radius = Math.max(3, Number(styleConfig.strokeWidth) + 1);
  const pointSymbolizer = `
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">${styleConfig.fillColor}</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">${styleConfig.strokeColor}</CssParameter>
                  <CssParameter name="stroke-width">${styleConfig.strokeWidth}</CssParameter>
                </Stroke>
              </Mark>
              <Size>${radius}</Size>
            </Graphic>
          </PointSymbolizer>`;
  const lineSymbolizer = `
          <LineSymbolizer>
            <Stroke>
              <CssParameter name="stroke">${styleConfig.strokeColor}</CssParameter>
              <CssParameter name="stroke-width">${styleConfig.strokeWidth}</CssParameter>
            </Stroke>
          </LineSymbolizer>`;
  const polygonSymbolizer = `
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">${styleConfig.fillColor}</CssParameter>
              <CssParameter name="fill-opacity">${fillOpacity}</CssParameter>
            </Fill>
            <Stroke>
              <CssParameter name="stroke">${styleConfig.strokeColor}</CssParameter>
              <CssParameter name="stroke-width">${styleConfig.strokeWidth}</CssParameter>
            </Stroke>
          </PolygonSymbolizer>`;
  if (geometryType === 'point') return pointSymbolizer;
  if (geometryType === 'line') return lineSymbolizer;
  if (geometryType === 'polygon') return polygonSymbolizer;
  return `${pointSymbolizer}\n${lineSymbolizer}\n${polygonSymbolizer}`;
};

export const styleConfigToSldBody = (layerName, styleConfig, geometryType = 'all') => {
  const normalized = normalizeLayerStyle(styleConfig);
  const attrStyle = normalized.attributeStyle;
  let rulesMarkup = '';

  if (attrStyle?.enabled && attrStyle?.field && Array.isArray(attrStyle.rules) && attrStyle.rules.length) {
    const field = xmlEscape(attrStyle.field);
    rulesMarkup = attrStyle.rules
      .map((rule) => {
        const ruleStyle = normalizeSimpleStyle(rule.style);
        const ruleValue = xmlEscape(rule.value);
        return `
        <Rule>
          <Name>${field}:${ruleValue}</Name>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>${field}</ogc:PropertyName>
              <ogc:Literal>${ruleValue}</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
${symbolizersToSld(ruleStyle, geometryType)}
        </Rule>`;
      })
      .join('\n');

    rulesMarkup += `
        <Rule>
          <ElseFilter/>
${symbolizersToSld(normalized, geometryType)}
        </Rule>`;
  } else {
    rulesMarkup = `
        <Rule>
${symbolizersToSld(normalized, geometryType)}
        </Rule>`;
  }

  return `
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer>
    <Name>${layerName}</Name>
    <UserStyle>
      <FeatureTypeStyle>
${rulesMarkup}
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>`.trim();
};

const styleUtils = {
  normalizeSimpleStyle,
  normalizeLayerStyle,
  loadLocalNamedStyles,
  loadLocalLayerStyleMap,
  loadLocalLayerSelections,
  xmlEscape,
  extractFillOpacity,
  symbolizersToSld,
  styleConfigToSldBody,
};

export default styleUtils;
