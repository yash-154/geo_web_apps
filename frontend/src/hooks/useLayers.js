import { useCallback } from 'react';
import GeoJSON from 'ol/format/GeoJSON';
import VectorSource from 'ol/source/Vector';
import VectorLayer from 'ol/layer/Vector';
import { Fill, Stroke, Style, Circle } from 'ol/style';
import shp from 'shpjs';
import { hexToRgb } from '../utils/colorUtils';

export default function useLayers(context) {
  const {
    layersConfig,
    setLayersConfig,
    layersRef,
    fetchAttributes,
    setActiveTab,
    setAttributeData,
    setActiveAttributeLayer,
    setAttributeMeta,
    clearHoverHighlight,
    closePopup,
    attributeStyleDrafts,
    setAttributeStyleDrafts,
    attributeStyleColumns,
    setAttributeStyleColumns,
    MAX_ATTRIBUTE_SLD_RULES,
    namedStyles,
    setNamedStyles,
    newStyleName,
    setNewStyleName,
    newStyleDraft,
    setNewStyleDraft,
    styleEditorMode,
    setStyleEditorMode,
    setEditingStyleName,
    setAddingStyleForLayer,
    fetchAttributeStyleColumns,
    layerStyleSelections,
    setLayerStyleSelections,
    mapRef,
    importedLayersRef,
    setImportedLayers,
    profileLineLayerRef,
    setProfileMode,
    setProfilePoints,
    setProfileData,
    setProfileError,
    setProfileOpen,
    routingLayerRef,
    setRoutingMode,
    setRoutingPoints,
    setRoutingError,
  } = context;

  const toggleLayer = useCallback((id) => {
    setLayersConfig((prev) => {
      const next = prev.map((l) => (l.id === id ? { ...l, visible: !l.visible } : l));
      const nextActive = next.find((l) => l.visible);
      if (nextActive) {
        fetchAttributes(nextActive.apiLayer, null, nextActive.title);
        setActiveTab('attributes');
      } else {
        setAttributeData(null);
        setActiveAttributeLayer(null);
        setAttributeMeta(null);
        clearHoverHighlight();
      }
      return next;
    });

    const layer = layersRef.current[id];
    if (layer) layer.setVisible(!layer.getVisible());
    closePopup();
  }, [setLayersConfig, fetchAttributes, setActiveTab, setAttributeData, setActiveAttributeLayer, setAttributeMeta, clearHoverHighlight, layersRef, closePopup]);

  const getAttributeStyleDraft = useCallback((layerId, layerStyle) => {
    const existing = attributeStyleDrafts[layerId];
    if (existing) return existing;
    const attrStyle = layerStyle?.attributeStyle;
    return {
      enabled: Boolean(attrStyle?.enabled),
      field: attrStyle?.field || '',
      value: '',
      strokeColor: layerStyle?.strokeColor || '#2563eb',
      fillColor: (layerStyle?.fillColor || '#2563eb').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/)?.slice(1,4).map(x=>Number(x).toString(16).padStart(2,'0')).join('') ? '#2563eb' : '#2563eb',
      strokeWidth: Number(layerStyle?.strokeWidth) || 2,
      opacity: Number(layerStyle?.opacity) || 1,
    };
  }, [attributeStyleDrafts]);

  const updateAttributeStyleDraft = useCallback((layerId, updates) => {
    setAttributeStyleDrafts((prev) => ({ ...(prev || {}), [layerId]: { ...(prev[layerId] || {}), ...updates } }));
  }, [setAttributeStyleDrafts]);

  const setAttributeStyleEnabled = useCallback((layerId, enabled) => {
    const layerCfg = layersConfig.find((layer) => layer.id === layerId);
    const attr = layerCfg?.style?.attributeStyle;
    if (!attr?.field || !Array.isArray(attr.rules) || !attr.rules.length) return;
    // reuse updateGeoserverLayerStyle via setLayersConfig
    setLayersConfig((prev) => prev.map((layer) => {
      if (layer.id !== layerId) return layer;
      const nextStyle = { ...(layer.style || {}), attributeStyle: { ...attr, enabled: Boolean(enabled) } };
      return { ...layer, style: nextStyle };
    }));
  }, [layersConfig, setLayersConfig]);

  const addAttributeStyleRule = useCallback((layerId) => {
    const layerCfg = layersConfig.find((layer) => layer.id === layerId);
    if (!layerCfg) return;
    const draft = getAttributeStyleDraft(layerId, layerCfg.style);
    const field = (draft.field || '').trim();
    const value = (draft.value || '').trim();
    if (!field || !value) return;
    const { r, g, b } = hexToRgb(draft.fillColor || '#2563eb');
    const fillRgba = `rgba(${r},${g},${b},0.2)`;
    const ruleStyle = { strokeColor: draft.strokeColor, fillColor: fillRgba, strokeWidth: Math.max(1, Number(draft.strokeWidth) || 1), opacity: Math.max(0, Math.min(1, Number(draft.opacity) || 1)) };
    const existing = layerCfg.style?.attributeStyle;
    const existingRules = Array.isArray(existing?.rules) ? existing.rules : [];
    const filtered = existingRules.filter((rule) => String(rule.value) !== value);
    const nextRules = [...filtered, { id: `${field}-${Date.now()}`, value, style: ruleStyle }].slice(-MAX_ATTRIBUTE_SLD_RULES);
    setLayersConfig((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, style: { ...(layer.style || {}), attributeStyle: { field, enabled: Boolean(draft.enabled), rules: nextRules } } } : layer)));
  }, [layersConfig, getAttributeStyleDraft, setLayersConfig, MAX_ATTRIBUTE_SLD_RULES]);

  const removeAttributeStyleRule = useCallback((layerId, ruleValue) => {
    const layerCfg = layersConfig.find((layer) => layer.id === layerId);
    if (!layerCfg?.style?.attributeStyle) return;
    const attrStyle = layerCfg.style.attributeStyle;
    const nextRules = (attrStyle.rules || []).filter((rule) => String(rule.value) !== String(ruleValue));
    if (!nextRules.length) {
      setLayersConfig((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, style: { ...(layer.style || {}), attributeStyle: null } } : layer)));
      return;
    }
    const enabled = Boolean(attrStyle.enabled);
    setLayersConfig((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, style: { ...(layer.style || {}), attributeStyle: { field: attrStyle.field, enabled, rules: nextRules } } } : layer)));
  }, [layersConfig, setLayersConfig]);

  const addNamedStyle = useCallback((layerId) => {
    const name = (newStyleName || '').trim();
    if (!name) return null;
    if (namedStyles.some((item) => item.name.toLowerCase() === name.toLowerCase())) return null;
    const layerCfg = layersConfig.find((layer) => layer.id === layerId);
    const { r, g, b } = hexToRgb(newStyleDraft.fillColor || '#2563eb');
    const fillRgba = `rgba(${r},${g},${b},0.2)`;
    const stylePayload = { strokeColor: newStyleDraft.strokeColor, fillColor: fillRgba, strokeWidth: Math.max(1, Number(newStyleDraft.strokeWidth) || 1), opacity: Math.max(0, Math.min(1, Number(newStyleDraft.opacity) || 1)) };
    if (layerCfg?.style?.attributeStyle?.field && Array.isArray(layerCfg.style.attributeStyle.rules) && layerCfg.style.attributeStyle.rules.length) {
      stylePayload.attributeStyle = layerCfg.style.attributeStyle;
    }
    const styleEntry = { name, style: stylePayload };
    setNamedStyles((prev) => [...prev, styleEntry]);
    setNewStyleName('');
    return styleEntry;
  }, [newStyleName, namedStyles, newStyleDraft, layersConfig, setNamedStyles, setNewStyleName]);

  const rgbaToHex = useCallback((rgba, fallback = '#2563eb') => {
    const match = (rgba || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return fallback;
    return `#${match.slice(1,4).map((v) => Number(v).toString(16).padStart(2,'0')).join('')}`;
  }, []);

  const applyNamedStyleToLayer = useCallback((layerId, styleName) => {
    if (styleName === '__add_new__') {
      const layerCfg = layersConfig.find((layer) => layer.id === layerId);
      setEditingStyleName('');
      setAddingStyleForLayer?.(layerId);
      setStyleEditorMode('add');
      setNewStyleName('');
      setNewStyleDraft({ strokeColor: layerCfg?.style?.strokeColor || '#2563eb', fillColor: rgbaToHex(layerCfg?.style?.fillColor, '#2563eb'), strokeWidth: Number(layerCfg?.style?.strokeWidth) || 2, opacity: Number(layerCfg?.style?.opacity) || 1, });
      fetchAttributeStyleColumns?.(layerCfg);
      setAttributeStyleDrafts((prev) => ({ ...prev, [layerId]: getAttributeStyleDraft(layerId, layerCfg?.style) }));
      return;
    }
    if (styleName === '__edit_current__') {
      const selectedName = layerStyleSelections[layerId];
      if (!selectedName) return;
      const styleEntry = namedStyles.find((item) => item.name === selectedName);
      if (!styleEntry) return;
      setAddingStyleForLayer?.(layerId);
      setStyleEditorMode('edit');
      setEditingStyleName(styleEntry.name);
      setNewStyleName(styleEntry.name);
      setNewStyleDraft({ strokeColor: styleEntry.style.strokeColor, fillColor: rgbaToHex(styleEntry.style.fillColor, '#2563eb'), strokeWidth: Number(styleEntry.style.strokeWidth) || 2, opacity: Number(styleEntry.style.opacity) || 1, });
      const layerCfg = layersConfig.find((layer) => layer.id === layerId);
      fetchAttributeStyleColumns?.(layerCfg);
      setAttributeStyleDrafts((prev) => ({ ...prev, [layerId]: getAttributeStyleDraft(layerId, styleEntry.style) }));
      return;
    }
    setAddingStyleForLayer?.('');
    setLayerStyleSelections((prev) => ({ ...prev, [layerId]: styleName }));
    if (!styleName) return;
    const styleEntry = namedStyles.find((item) => item.name === styleName);
    if (!styleEntry) return;
    // update layer style
    setLayersConfig((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, style: { ...(layer.style || {}), ...styleEntry.style } } : layer)));
  }, [
    layersConfig,
    namedStyles,
    layerStyleSelections,
    setLayerStyleSelections,
    setEditingStyleName,
    setAddingStyleForLayer,
    setStyleEditorMode,
    setNewStyleName,
    setNewStyleDraft,
    fetchAttributeStyleColumns,
    setAttributeStyleDrafts,
    getAttributeStyleDraft,
    rgbaToHex,
    setLayersConfig,
  ]);

  // File import helpers
  const addVectorLayerFromGeoJSON = useCallback((geojson, name = 'Imported Layer') => {
    let processedGeojson = { ...geojson };
    if (!processedGeojson.crs) processedGeojson.crs = { type: 'name', properties: { name: 'EPSG:4326' } };
    let features;
    try {
      features = new GeoJSON().readFeatures(processedGeojson, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
      if (!features || !features.length) return;
    } catch (error) {
      console.error('Error creating features:', error);
      return;
    }
    const source = new VectorSource({ features });
    const vectorLayer = new VectorLayer({ source, style: (feature) => {
      const geometry = feature.getGeometry();
      const geometryType = geometry.getType();
      if (geometryType === 'Point') return new Style({ image: new Circle({ radius: 5, fill: new Fill({ color: 'rgba(37,99,235,0.8)' }), stroke: new Stroke({ color: '#2563eb', width: 2 }) }) });
      if (geometryType === 'LineString' || geometryType === 'MultiLineString') return new Style({ stroke: new Stroke({ color: '#2563eb', width: 2 }) });
      if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') return new Style({ stroke: new Stroke({ color: '#2563eb', width: 2 }), fill: new Fill({ color: 'rgba(37,99,235,0.2)' }) });
      return new Style();
    }, visible: true });
    vectorLayer.set('title', name);
    vectorLayer.set('id', `imported_${Date.now()}`);
    if (mapRef?.current) mapRef.current.addLayer(vectorLayer);
    const layerInfo = { id: vectorLayer.get('id'), title: name, layer: vectorLayer, visible: true, style: { strokeColor: '#2563eb', fillColor: 'rgba(37,99,235,0.2)', strokeWidth: 2, opacity: 1 } };
    setImportedLayers((prev) => [...prev, layerInfo]);
  }, [mapRef, setImportedLayers]);

  const handleFileImport = useCallback(async (file) => {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'geojson' || ext === 'json') {
        const text = await file.text();
        const geojson = JSON.parse(text);
        addVectorLayerFromGeoJSON(geojson, file.name);
      } else if (ext === 'zip') {
        const arrayBuffer = await file.arrayBuffer();
        const geojson = await shp(arrayBuffer);
        let processedGeojson = Array.isArray(geojson) ? geojson[0] : geojson;
        if (!processedGeojson || !processedGeojson.features || processedGeojson.features.length === 0) return;
        if (!processedGeojson.crs) processedGeojson.crs = { type: 'name', properties: { name: 'EPSG:4326' } };
        addVectorLayerFromGeoJSON(processedGeojson, file.name);
      } else {
        // unsupported
      }
    } catch (error) {
      console.error('Error importing file:', error);
    }
  }, [addVectorLayerFromGeoJSON]);

  const toggleImportedLayer = useCallback((id) => {
    setImportedLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer)));
    const layer = importedLayersRef.current.find((l) => l.id === id);
    if (layer) {
      layer.layer.setVisible(!layer.visible);
      if (!layer.visible) {
        setActiveTab('attributes');
      }
    }
  }, [setImportedLayers, importedLayersRef, setActiveTab]);

  const updateLayerStyle = useCallback((id, styleUpdates) => {
    setImportedLayers((prev) => prev.map((layer) => (layer.id === id ? { ...layer, style: { ...layer.style, ...styleUpdates } } : layer)));
    const layer = importedLayersRef.current.find((l) => l.id === id);
    if (layer) {
      const newStyle = { ...layer.style, ...styleUpdates };
      layer.layer.setStyle((feature) => {
        const geometry = feature.getGeometry();
        const geometryType = geometry.getType();
        if (geometryType === 'Point') return new Style({ image: new Circle({ radius: 5, fill: new Fill({ color: newStyle.fillColor }), stroke: new Stroke({ color: newStyle.strokeColor, width: newStyle.strokeWidth }) }) });
        if (geometryType === 'LineString' || geometryType === 'MultiLineString') return new Style({ stroke: new Stroke({ color: newStyle.strokeColor, width: newStyle.strokeWidth }) });
        if (geometryType === 'Polygon' || geometryType === 'MultiPolygon') return new Style({ stroke: new Stroke({ color: newStyle.strokeColor, width: newStyle.strokeWidth }), fill: new Fill({ color: newStyle.fillColor }) });
        return new Style();
      });
      layer.layer.setOpacity(newStyle.opacity);
    }
  }, [setImportedLayers, importedLayersRef]);

  const exportLayerAsGeoJSON = useCallback((id) => {
    const layer = importedLayersRef.current.find((l) => l.id === id);
    if (!layer) return;
    const features = layer.layer.getSource().getFeatures();
    const geojson = new GeoJSON().writeFeaturesObject(features, { featureProjection: 'EPSG:3857', dataProjection: 'EPSG:4326' });
    const dataStr = JSON.stringify(geojson, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${layer.title.replace(/\.[^/.]+$/, '')}_4326.geojson`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  }, [importedLayersRef]);

  const clearAllImportedLayers = useCallback(() => {
    if (mapRef.current) {
      importedLayersRef.current.forEach((layerInfo) => mapRef.current.removeLayer(layerInfo.layer));
    }
    setImportedLayers([]);
  }, [mapRef, importedLayersRef, setImportedLayers]);

  const removeImportedLayer = useCallback((id) => {
    const layerInfo = importedLayersRef.current.find((l) => l.id === id);
    if (!layerInfo) return;
    if (mapRef.current) mapRef.current.removeLayer(layerInfo.layer);
    setImportedLayers((prev) => prev.filter((l) => l.id !== id));
  }, [importedLayersRef, mapRef, setImportedLayers]);

  const startProfileMode = useCallback(() => {
    setProfileMode(true);
    setProfilePoints([]);
    setProfileData([]);
    setProfileError('');
    setProfileOpen(true);
    profileLineLayerRef.current?.getSource().clear();
  }, [setProfileMode, setProfilePoints, setProfileData, setProfileError, setProfileOpen, profileLineLayerRef]);

  const clearProfile = useCallback(() => {
    setProfileMode(false);
    setProfilePoints([]);
    setProfileData([]);
    setProfileError('');
    setProfileOpen(false);
    profileLineLayerRef.current?.getSource().clear();
  }, [setProfileMode, setProfilePoints, setProfileData, setProfileError, setProfileOpen, profileLineLayerRef]);

  const startRoutingMode = useCallback(() => {
    setRoutingMode(true);
    setRoutingPoints([]);
    setRoutingError('');
    routingLayerRef.current?.getSource().clear();
  }, [setRoutingMode, setRoutingPoints, setRoutingError, routingLayerRef]);

  return {
    toggleLayer,
    getAttributeStyleDraft,
    updateAttributeStyleDraft,
    setAttributeStyleEnabled,
    addAttributeStyleRule,
    removeAttributeStyleRule,
    addNamedStyle,
    rgbaToHex,
    applyNamedStyleToLayer,
    addNamedStyleForLayer: (layerId) => {
      if (styleEditorMode === 'edit') {
        return null;
      }
      const created = addNamedStyle(layerId);
      if (!created) return null;
      setLayerStyleSelections((prev) => ({ ...prev, [layerId]: created.name }));
      setLayersConfig((prev) => prev.map((layer) => (layer.id === layerId ? { ...layer, style: { ...(layer.style || {}), ...created.style } } : layer)));
      setAddingStyleForLayer?.('');
      setEditingStyleName?.('');
      return created;
    },
    handleFileImport,
    addVectorLayerFromGeoJSON,
    toggleImportedLayer,
    updateLayerStyle,
    exportLayerAsGeoJSON,
    clearAllImportedLayers,
    removeImportedLayer,
    startProfileMode,
    clearProfile,
    startRoutingMode,
    fetchAttributeStyleColumns: async (layerCfg) => {
      if (!layerCfg?.apiLayer) return;
      if (Array.isArray(attributeStyleColumns[layerCfg.id]) && attributeStyleColumns[layerCfg.id].length) return;
      try {
        const res = await fetch(`http://192.168.20.57:7000/api/attributes/?layer=${layerCfg.apiLayer}&limit=1`);
        const json = await res.json();
        const cols = Array.isArray(json?.columns) ? json.columns : [];
        setAttributeStyleColumns((prev) => ({ ...prev, [layerCfg.id]: cols }));
      } catch {
        setAttributeStyleColumns((prev) => ({ ...prev, [layerCfg.id]: [] }));
      }
    },
  };
}
