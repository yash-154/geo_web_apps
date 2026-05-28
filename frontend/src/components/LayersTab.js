import React from 'react';
import './LayersTab.css';
import { hexToRgb } from '../utils/colorUtils';

const LayersTab = ({
  layersConfig,
  toggleLayer,
  layerStyleSelections,
  applyNamedStyleToLayer,
  namedStyles,
  addingStyleForLayer,
  newStyleName,
  setNewStyleName,
  addNamedStyleForLayer,
  styleEditorMode,
  newStyleDraft,
  setNewStyleDraft,
  getAttributeStyleDraft,
  updateAttributeStyleDraft,
  setAttributeStyleEnabled,
  attributeStyleColumns,
  attributeStyleDistinctValues,
  addAttributeStyleRule,
  removeAttributeStyleRule,
  attributeStyleDistinctLoading,
  rgbaToHex,
  importedLayers,
  toggleImportedLayer,
  setAttributesFromImportedLayer,
  setActiveTab,
  exportLayerAsGeoJSON,
  removeImportedLayer,
  updateLayerStyle,
  handleFileImport,
  clearAllImportedLayers,
  routingToken,
  setRoutingToken,
  startRoutingMode,
  clearRouting,
  routingMode,
  routingPoints,
  routingLoading,
  routingError,
}) => {
  return (
    <div>
      {/* Existing GeoServer layers */}
      {layersConfig.map((l) => (
        <div key={l.id} className="layer-card">
          <div className="layer-row">
            <label>
              <input
                type="checkbox"
                checked={l.visible}
                onChange={() => toggleLayer(l.id)}
              />{' '}
              {l.title}
            </label>
            <select
              className="layer-style-select"
              value={layerStyleSelections[l.id] || ''}
              onChange={(e) => applyNamedStyleToLayer(l.id, e.target.value)}
            >
              <option value="">Style</option>
              {namedStyles.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.name}
                </option>
              ))}
              <option value="__add_new__">+ Add new style</option>
              <option value="__edit_current__" disabled={!layerStyleSelections[l.id]}>
                ✎ Edit current style
              </option>
            </select>
          </div>
          {addingStyleForLayer === l.id && (
            <div className="style-inline-editor">
              <div className="style-library-row">
                <input
                  type="text"
                  placeholder="Style name"
                  value={newStyleName}
                  onChange={(e) => setNewStyleName(e.target.value)}
                />
                <button className="analysis-btn" onClick={() => addNamedStyleForLayer(l.id)}>
                  {styleEditorMode === 'edit' ? 'Update Style' : 'Save'}
                </button>
              </div>
              <div className="style-library-row">
                <label>Stroke</label>
                <input
                  type="color"
                  value={newStyleDraft.strokeColor}
                  onChange={(e) => setNewStyleDraft((prev) => ({ ...prev, strokeColor: e.target.value }))}
                />
                <label>Fill</label>
                <input
                  type="color"
                  value={newStyleDraft.fillColor}
                  onChange={(e) => setNewStyleDraft((prev) => ({ ...prev, fillColor: e.target.value }))}
                />
              </div>
              <div className="style-library-row">
                <label>Width</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={newStyleDraft.strokeWidth}
                  onChange={(e) => setNewStyleDraft((prev) => ({ ...prev, strokeWidth: parseInt(e.target.value, 10) || 1 }))}
                />
                <label>Opacity</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newStyleDraft.opacity}
                  onChange={(e) => setNewStyleDraft((prev) => ({ ...prev, opacity: parseFloat(e.target.value) }))}
                />
              </div>
              <div className="style-library-row">
                <strong>Attribute style</strong>
              </div>
              <div className="style-library-row">
                <label>
                  <input
                    type="checkbox"
                    checked={getAttributeStyleDraft(l.id, l.style).enabled}
                    onChange={(e) => {
                      const enabled = e.target.checked;
                      updateAttributeStyleDraft(l.id, { enabled });
                      setAttributeStyleEnabled(l.id, enabled);
                    }}
                  />
                  Enable attribute style
                </label>
              </div>
              <div className="style-library-row">
                <label>Field</label>
                <select
                  value={getAttributeStyleDraft(l.id, l.style).field}
                  onChange={(e) =>
                    updateAttributeStyleDraft(l.id, {
                      field: e.target.value,
                      value: '',
                    })
                  }
                >
                  <option value="">Select field</option>
                  {(attributeStyleColumns[l.id] || []).map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
              <div className="style-library-row">
                <label>Value</label>
                <input
                  type="text"
                  list={`attr-style-values-${l.id}`}
                  placeholder="Type or pick value"
                  value={getAttributeStyleDraft(l.id, l.style).value}
                  onChange={(e) => updateAttributeStyleDraft(l.id, { value: e.target.value })}
                />
                <datalist id={`attr-style-values-${l.id}`}>
                  {(attributeStyleDistinctValues[l.id] || []).map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
                <button
                  className="analysis-btn"
                  type="button"
                  onClick={() => addAttributeStyleRule(l.id)}
                  disabled={
                    !getAttributeStyleDraft(l.id, l.style).field ||
                    !getAttributeStyleDraft(l.id, l.style).value.trim()
                  }
                >
                  Add Rule
                </button>
              </div>
              <div className="style-library-row">
                <label>Rule Stroke</label>
                <input
                  type="color"
                  value={getAttributeStyleDraft(l.id, l.style).strokeColor}
                  onChange={(e) => updateAttributeStyleDraft(l.id, { strokeColor: e.target.value })}
                />
                <label>Rule Fill</label>
                <input
                  type="color"
                  value={getAttributeStyleDraft(l.id, l.style).fillColor}
                  onChange={(e) => updateAttributeStyleDraft(l.id, { fillColor: e.target.value })}
                />
                <label>Rule Width</label>
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={getAttributeStyleDraft(l.id, l.style).strokeWidth}
                  onChange={(e) =>
                    updateAttributeStyleDraft(l.id, {
                      strokeWidth: parseInt(e.target.value, 10) || 1,
                    })
                  }
                />
              </div>
              <div className="attr-rule-list">
                {attributeStyleDistinctLoading[l.id] && (
                  <div className="attr-rule-hint">Loading values...</div>
                )}
                {Array.isArray(l.style?.attributeStyle?.rules) &&
                  l.style.attributeStyle.rules.length ? (
                  l.style.attributeStyle.rules.map((rule) => (
                    <div key={rule.id || rule.value} className="attr-rule-item">
                      <span className="attr-rule-label">
                        {l.style.attributeStyle.field} = {String(rule.value)}
                      </span>
                      <span
                        className="attr-rule-color"
                        style={{ background: rgbaToHex(rule.style?.fillColor, '#2563eb') }}
                      />
                      <button
                        type="button"
                        className="attr-rule-remove"
                        onClick={() => removeAttributeStyleRule(l.id, rule.value)}
                        title="Remove rule"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="attr-rule-hint">No attribute rule yet.</div>
                )}
              </div>
            </div>
          )}
        </div>
      ))}

      <hr />

      {/* Imported Layers */}
      {importedLayers.map((layer) => (
        <div key={layer.id} className="layer-card imported-layer">
          <div className="layer-header">
            <label>
              <input
                type="checkbox"
                checked={layer.visible}
                onChange={() => toggleImportedLayer(layer.id)}
              />{' '}
              {layer.title}
            </label>

            <div className="layer-actions">
              <button
                className="attr-btn"
                onClick={() => {
                  setAttributesFromImportedLayer(layer);
                  setActiveTab('attributes');
                }}
                title="View attributes"
              >
                📑
              </button>

              <button
                className="export-btn"
                onClick={() => exportLayerAsGeoJSON(layer.id)}
                title="Export as GeoJSON"
              >
                📥
              </button>

              <button
                className="remove-btn"
                onClick={() => removeImportedLayer(layer.id)}
                title="Remove layer"
              >
                🗑
              </button>
            </div>
          </div>

          {/* Style Editor */}
          <div className="style-editor">
            <div className="style-row">
              <label>Stroke:</label>
              <input
                type="color"
                value={layer.style.strokeColor}
                onChange={(e) => updateLayerStyle(layer.id, { strokeColor: e.target.value })}
              />
              <input
                type="number"
                min="1"
                max="10"
                value={layer.style.strokeWidth}
                onChange={(e) => updateLayerStyle(layer.id, { strokeWidth: parseInt(e.target.value) })}
                style={{ width: '50px' }}
              />
            </div>
            <div className="style-row">
              <label>Fill:</label>
              <input
                type="color"
                value={'#' + (layer.style.fillColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)?.slice(1, 4).map(x => parseInt(x).toString(16).padStart(2, '0')).join('') || '2563eb')}
                onChange={(e) => {
                  const rgb = e.target.value;
                  const { r, g, b } = hexToRgb(rgb);
                  const rgba = `rgba(${r},${g},${b},0.2)`;
                  updateLayerStyle(layer.id, { fillColor: rgba });
                }}
              />
            </div>
            <div className="style-row">
              <label>Opacity:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={layer.style.opacity}
                onChange={(e) => updateLayerStyle(layer.id, { opacity: parseFloat(e.target.value) })}
              />
            </div>
          </div>
        </div>
      ))}

      <hr />

      <div className="layer-card import-card">
        <strong>📁 Import Data</strong>
        <input
          type="file"
          accept=".geojson,.json,.zip"
          onChange={(e) => {
            if (e.target.files.length) {
              handleFileImport(e.target.files[0]);
              e.target.value = null;
            }
          }}
        />
        <small>
          Supported: GeoJSON (.geojson), Shapefile (.zip)
        </small>
      </div>

      {importedLayers.length > 0 && (
        <button className="clear-import-btn" onClick={clearAllImportedLayers}>
          Clear all imported layers
        </button>
      )}

      <hr />

      <div className="layer-card routing-card">
        <strong>Shortest Path (Bhuvan)</strong>
        <div className="routing-row">
          <label>Token</label>
          <input
            type="password"
            value={routingToken}
            onChange={(e) => setRoutingToken(e.target.value)}
            placeholder="Bhuvan token"
          />
        </div>
        <div className="routing-row routing-row-inline">
          <button
            className="analysis-btn"
            onClick={startRoutingMode}
            disabled={!routingToken}
          >
            {routingMode ? 'Pick 2 points...' : 'Pick A → B'}
          </button>
          <button className="analysis-btn secondary" onClick={clearRouting}>
            Clear
          </button>
        </div>
        {routingPoints.length > 0 && (
          <div className="routing-help">
            Points selected: {routingPoints.length}/2
          </div>
        )}
        {routingLoading && <div className="routing-help">Routing…</div>}
        {routingError && <div className="routing-error">{routingError}</div>}
        <div className="routing-help">
          Click two points on the map. A = start, B = end.
        </div>
      </div>
    </div>
  );
};

export default LayersTab;