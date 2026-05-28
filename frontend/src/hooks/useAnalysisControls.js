import { useCallback } from 'react';
import GeoJSON from 'ol/format/GeoJSON';
import WKT from 'ol/format/WKT';
import Draw, { createBox } from 'ol/interaction/Draw';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import { transformExtent } from 'ol/proj';
import { postJson } from '../utils/api';

export default function useAnalysisControls(context) {
  const {
    analysisApiBase,
    geoserverProxyBase,
    osmQueryApi,
    osmDatasets,
    mapRef,
    layersRef,
    layersConfigRef,
    setLayersConfig,
    importedLayersRef,
    setImportedLayers,
    wfsCacheRef,
    heatmapLayerRef,
    spatialQueryLayerRef,
    osmAoiLayerRef,
    osmAoiDrawRef,
    bufferLayerRef,
    bufferDrawRef,
    bufferFilteredStateRef,
    bufferAttributesAppliedRef,
    aoiDrawRef,
    highlightLayerRef,
    hoverHighlightLayerRef,
    setAttributeData,
    setActiveAttributeLayer,
    setAttributeMeta,
    clearHoverHighlight,
    closePopup,
    setActiveTab,
    setHeatmapError,
    setHeatmapPointCount,
    setHeatmapFields,
    setHeatmapLoading,
    heatmapTargetLayer,
    heatmapWeightField,
    setBufferMode,
    setSpatialQueryError,
    setSpatialQueryResultCount,
    setSpatialQueryReferenceLayer,
    setSpatialQueryTargetLayer,
    setSpatialQueryOperator,
    setSpatialQueryDistance,
    setSpatialQueryLoading,
    spatialQueryReferenceLayer,
    spatialQueryTargetLayer,
    spatialQueryOperator,
    spatialQueryDistance,
    setOsmAoiMode,
    setOsmAoiBbox4326,
    setOsmAvailableDatasets,
    setOsmSelectedDatasets,
    setOsmDataError,
    setOsmAvailabilityLoading,
    setOsmImportLoading,
    osmAoiBbox4326,
    osmAvailableDatasets,
    osmSelectedDatasets,
    osmAoiInputMode,
    setBufferInputMode,
    setBufferDistance,
    setBufferTargetLayer,
    setBufferLoading,
    setBufferError,
    setBufferResultCount,
    bufferTargetLayer,
    bufferInputMode,
    bufferTargetLayerRef,
    bufferDistanceRef,
    setRoutingMode,
    setProfileMode,
    setLulcAoiMode,
    addVectorLayerFromGeoJSONRef,
  } = context;

  const clearBufferSelectionFilter = useCallback(() => {
    const state = bufferFilteredStateRef.current;
    if (!state) return;

    if (state.type === 'geoserver' && state.layerId) {
      layersRef.current[state.layerId]?.setVisible(state.wasVisible ?? true);
    } else if (state.type === 'imported' && state.layerId) {
      const info = importedLayersRef.current.find((item) => item.id === state.layerId);
      info?.layer?.setVisible(state.wasVisible ?? true);
    }

    bufferFilteredStateRef.current = null;
  }, [bufferFilteredStateRef, importedLayersRef, layersRef]);

  const clearHeatmap = useCallback(() => {
    const source = heatmapLayerRef.current?.getSource?.();
    source?.clear?.();
    heatmapLayerRef.current?.setVisible(false);
    setHeatmapError('');
    setHeatmapPointCount(0);
  }, [heatmapLayerRef, setHeatmapError, setHeatmapPointCount]);

  const clearSpatialQuery = useCallback(() => {
    spatialQueryLayerRef.current?.getSource?.()?.clear?.();
    spatialQueryLayerRef.current?.setVisible(false);
    setSpatialQueryError('');
    setSpatialQueryResultCount(0);
  }, [setSpatialQueryError, setSpatialQueryResultCount, spatialQueryLayerRef]);

  const clearOsmAoiInteraction = useCallback(() => {
    if (mapRef.current && osmAoiDrawRef.current) {
      mapRef.current.removeInteraction(osmAoiDrawRef.current);
      osmAoiDrawRef.current = null;
    }
  }, [mapRef, osmAoiDrawRef]);

  const clearOsmDataTool = useCallback(() => {
    clearOsmAoiInteraction();
    osmAoiLayerRef.current?.getSource?.()?.clear?.();
    setOsmAoiMode(false);
    setOsmAoiBbox4326(null);
    setOsmAvailableDatasets([]);
    setOsmSelectedDatasets({});
    setOsmDataError('');
    setOsmAvailabilityLoading(false);
    setOsmImportLoading(false);
  }, [
    clearOsmAoiInteraction,
    osmAoiLayerRef,
    setOsmAoiBbox4326,
    setOsmAoiMode,
    setOsmAvailabilityLoading,
    setOsmAvailableDatasets,
    setOsmDataError,
    setOsmImportLoading,
    setOsmSelectedDatasets,
  ]);

  const clearBuffer = useCallback(() => {
    clearBufferSelectionFilter();
    if (mapRef.current && bufferDrawRef.current) {
      mapRef.current.removeInteraction(bufferDrawRef.current);
      bufferDrawRef.current = null;
    }
    bufferLayerRef.current?.getSource().clear();
    setBufferMode(false);
    setBufferInputMode('center_click');
    setBufferDistance(250);
    setBufferTargetLayer('');
    setBufferLoading(false);
    setBufferError('');
    setBufferResultCount(0);
    if (bufferAttributesAppliedRef.current) {
      setAttributeData(null);
      setActiveAttributeLayer(null);
      setAttributeMeta(null);
      bufferAttributesAppliedRef.current = false;
      clearHoverHighlight();
      highlightLayerRef.current?.getSource()?.clear();
      closePopup();
    }
  }, [
    bufferAttributesAppliedRef,
    bufferDrawRef,
    bufferLayerRef,
    clearBufferSelectionFilter,
    clearHoverHighlight,
    closePopup,
    highlightLayerRef,
    mapRef,
    setActiveAttributeLayer,
    setAttributeData,
    setAttributeMeta,
    setBufferDistance,
    setBufferError,
    setBufferInputMode,
    setBufferLoading,
    setBufferMode,
    setBufferResultCount,
    setBufferTargetLayer,
  ]);

  const getCentroidCoordinate = useCallback((geometry) => {
    if (!geometry) return null;
    const extent = geometry.getExtent?.();
    if (!extent) return null;
    return [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
  }, []);

  const getCurrentMapExtent3857 = useCallback(() => {
    const map = mapRef.current;
    if (!map) return null;
    const size = map.getSize?.();
    if (!size) return null;
    return map.getView()?.calculateExtent(size) || null;
  }, [mapRef]);

  const roundExtent = (extent) =>
    Array.isArray(extent) && extent.length === 4
      ? extent.map((value) => Math.round(Number(value) / 25) * 25)
      : null;

  const getFeaturesForSelection = useCallback(async (selection, maxFeatures = 2500, extent = null) => {
    if (!selection) return [];
    if (selection.startsWith('imported:')) {
      const importedId = selection.replace('imported:', '');
      const info = importedLayersRef.current.find((item) => item.id === importedId);
      return info?.layer?.getSource?.()?.getFeatures?.() || [];
    }

    const layerCfg = layersConfigRef.current.find((layer) => layer.id === selection);
    if (!layerCfg?.layerName) return [];
    const roundedExtent = roundExtent(extent);
    const cacheKey = `${selection}|${maxFeatures}|${roundedExtent ? roundedExtent.join(',') : 'all'}`;
    const cached = wfsCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.ts < 15000) {
      return cached.features;
    }

    const params = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: layerCfg.layerName,
      outputFormat: 'application/json',
      srsName: 'EPSG:3857',
      maxFeatures: String(maxFeatures),
    });
    if (roundedExtent) {
      params.set('bbox', `${roundedExtent.join(',')},EPSG:3857`);
    }
    const res = await fetch(`${geoserverProxyBase}/wfs?${params.toString()}`);
    if (!res.ok) throw new Error('Failed to fetch layer features.');
    const json = await res.json();
    const features = new GeoJSON().readFeatures(json, {
      featureProjection: 'EPSG:3857',
    });
    wfsCacheRef.current.set(cacheKey, { ts: now, features });
    if (wfsCacheRef.current.size > 20) {
      const oldestKey = wfsCacheRef.current.keys().next().value;
      if (oldestKey) wfsCacheRef.current.delete(oldestKey);
    }
    return features;
  }, [geoserverProxyBase, importedLayersRef, layersConfigRef, wfsCacheRef]);

  const buildHeatmap = useCallback(async () => {
    if (!heatmapTargetLayer) {
      setHeatmapError('Select a layer first.');
      return;
    }
    const source = heatmapLayerRef.current?.getSource?.();
    if (!source) return;

    setHeatmapLoading(true);
    setHeatmapError('');
    setHeatmapPointCount(0);
    source.clear();

    try {
      const extent = getCurrentMapExtent3857();
      const features = await getFeaturesForSelection(heatmapTargetLayer, 2200, extent);

      const numericFields = new Set();
      const points = [];
      features.forEach((feature) => {
        const geom = feature.getGeometry?.();
        const center = getCentroidCoordinate(geom);
        if (!center) return;

        const props = feature.getProperties?.() || {};
        Object.entries(props).forEach(([key, value]) => {
          if (key === 'geometry') return;
          if (Number.isFinite(Number(value))) numericFields.add(key);
        });

        const pointFeature = new Feature(new Point(center));
        let weight = 1;
        if (heatmapWeightField && Number.isFinite(Number(props[heatmapWeightField]))) {
          weight = Math.max(0, Number(props[heatmapWeightField]));
        }
        pointFeature.set('_weight_raw', weight);
        points.push(pointFeature);
      });

      const maxWeight = Math.max(...points.map((feature) => Number(feature.get('_weight_raw') || 0)), 1);
      points.forEach((pointFeature) => {
        const weight = Number(pointFeature.get('_weight_raw') || 0);
        pointFeature.set('_weight', Math.min(1, Math.max(0, weight / maxWeight)));
      });

      source.addFeatures(points);
      heatmapLayerRef.current?.setVisible(true);
      setHeatmapFields(Array.from(numericFields).sort());
      setHeatmapPointCount(points.length);
      setBufferMode(false);
    } catch (error) {
      setHeatmapError(error.message || 'Failed to build heatmap.');
      heatmapLayerRef.current?.setVisible(false);
    } finally {
      setHeatmapLoading(false);
    }
  }, [
    getCentroidCoordinate,
    getCurrentMapExtent3857,
    getFeaturesForSelection,
    heatmapLayerRef,
    heatmapTargetLayer,
    heatmapWeightField,
    setBufferMode,
    setHeatmapError,
    setHeatmapFields,
    setHeatmapLoading,
    setHeatmapPointCount,
  ]);

  const executeSpatialQuery = useCallback(async ({
    referenceLayer,
    targetLayer,
    operator = 'inside',
    distance = 100,
    limit = 2500,
  }) => {
    if (!referenceLayer || !targetLayer) {
      const errorText = 'Select both reference and target layers.';
      setSpatialQueryError(errorText);
      return { ok: false, error: errorText };
    }

    setSpatialQueryReferenceLayer(referenceLayer);
    setSpatialQueryTargetLayer(targetLayer);
    setSpatialQueryOperator(operator);
    setSpatialQueryDistance(Math.max(1, Number(distance) || 1));
    setSpatialQueryLoading(true);
    setSpatialQueryError('');
    setSpatialQueryResultCount(0);
    spatialQueryLayerRef.current?.getSource?.()?.clear?.();

    try {
      const json = await postJson(`${analysisApiBase}/spatial-query/`, {
        reference_layer: referenceLayer,
        target_layer: targetLayer,
        operator,
        distance: Math.max(1, Number(distance) || 1),
        limit: Math.max(1, Number(limit) || 1),
      });
      const fc = {
        type: 'FeatureCollection',
        features: Array.isArray(json?.features) ? json.features : [],
      };
      const matched = new GeoJSON().readFeatures(fc, {
        dataProjection: 'EPSG:3857',
        featureProjection: 'EPSG:3857',
      });
      const displaySource = spatialQueryLayerRef.current?.getSource?.();
      displaySource?.clear?.();
      matched.forEach((feature) => {
        const clone = feature.clone();
        clone.set('kind', 'result');
        displaySource?.addFeature?.(clone);
      });
      spatialQueryLayerRef.current?.setVisible(true);

      const columns = [];
      const rows = matched.map((feature) => {
        const props = { ...feature.getProperties() };
        delete props.geometry;
        Object.keys(props).forEach((key) => {
          if (!columns.includes(key)) columns.push(key);
        });
        return props;
      });

      setAttributeData({
        columns,
        rows,
        message: matched.length ? '' : 'No records found for selected spatial query.',
      });
      setActiveAttributeLayer('Spatial Query Result');
      setAttributeMeta({
        source: 'spatial-query',
        layerId: targetLayer,
        rowFeatures: matched,
      });
      hoverHighlightLayerRef.current?.getSource?.()?.clear?.();
      setActiveTab('attributes');
      const resultCount = Number(json?.count) || matched.length;
      setSpatialQueryResultCount(resultCount);
      return { ok: true, count: resultCount };
    } catch (error) {
      const errorText = error.message || 'Spatial query failed.';
      setSpatialQueryError(errorText);
      spatialQueryLayerRef.current?.setVisible(false);
      return { ok: false, error: errorText };
    } finally {
      setSpatialQueryLoading(false);
    }
  }, [
    analysisApiBase,
    hoverHighlightLayerRef,
    setActiveAttributeLayer,
    setActiveTab,
    setAttributeData,
    setAttributeMeta,
    setSpatialQueryDistance,
    setSpatialQueryError,
    setSpatialQueryLoading,
    setSpatialQueryOperator,
    setSpatialQueryReferenceLayer,
    setSpatialQueryResultCount,
    setSpatialQueryTargetLayer,
    spatialQueryLayerRef,
  ]);

  const runSpatialQuery = useCallback(async () => {
    await executeSpatialQuery({
      referenceLayer: spatialQueryReferenceLayer,
      targetLayer: spatialQueryTargetLayer,
      operator: spatialQueryOperator,
      distance: spatialQueryDistance,
      limit: 2500,
    });
  }, [
    executeSpatialQuery,
    spatialQueryDistance,
    spatialQueryOperator,
    spatialQueryReferenceLayer,
    spatialQueryTargetLayer,
  ]);

  const requestOsmAvailability = useCallback(async () => {
    if (!osmAoiBbox4326) {
      setOsmDataError('Draw area first.');
      return;
    }
    setOsmAvailabilityLoading(true);
    setOsmDataError('');
    setOsmAvailableDatasets([]);
    setOsmSelectedDatasets({});

    try {
      const json = await postJson(osmQueryApi, { mode: 'availability', bbox: osmAoiBbox4326 });
      const datasetMap = Object.fromEntries(osmDatasets.map((item) => [item.key, item]));
      const available = (Array.isArray(json?.datasets) ? json.datasets : [])
        .filter((item) => Number(item?.count) > 0 && datasetMap[item.key])
        .map((item) => ({
          ...datasetMap[item.key],
          count: Number(item.count),
        }));
      setOsmAvailableDatasets(available);
      setOsmSelectedDatasets(
        Object.fromEntries(available.slice(0, 2).map((item) => [item.key, true]))
      );
      if (!available.length) {
        setOsmDataError('No data found in selected area.');
      }
    } catch (error) {
      setOsmDataError(error.message || 'Failed to fetch available OSM data.');
    } finally {
      setOsmAvailabilityLoading(false);
    }
  }, [
    osmAoiBbox4326,
    osmDatasets,
    osmQueryApi,
    setOsmAvailabilityLoading,
    setOsmAvailableDatasets,
    setOsmDataError,
    setOsmSelectedDatasets,
  ]);

  const importSelectedOsmData = useCallback(async () => {
    if (!osmAoiBbox4326) {
      setOsmDataError('Draw area first.');
      return;
    }
    const selected = osmAvailableDatasets.filter((item) => osmSelectedDatasets[item.key]);
    if (!selected.length) {
      setOsmDataError('Select at least one dataset.');
      return;
    }

    setOsmImportLoading(true);
    setOsmDataError('');

    try {
      const json = await postJson(osmQueryApi, {
        mode: 'fetch',
        bbox: osmAoiBbox4326,
        categories: selected.map((item) => item.key),
      });
      const features = Array.isArray(json?.features) ? json.features : [];
      if (!features.length) {
        throw new Error('No features returned for selected datasets.');
      }
      addVectorLayerFromGeoJSONRef.current?.(
        { type: 'FeatureCollection', features },
        `OSM_${selected.map((item) => item.key).join('_')}.geojson`
      );
      setActiveTab('layers');
    } catch (error) {
      setOsmDataError(error.message || 'Failed to import OSM data.');
    } finally {
      setOsmImportLoading(false);
    }
  }, [
    addVectorLayerFromGeoJSONRef,
    osmAoiBbox4326,
    osmAvailableDatasets,
    osmQueryApi,
    osmSelectedDatasets,
    setActiveTab,
    setOsmDataError,
    setOsmImportLoading,
  ]);

  const startOsmAoiMode = useCallback(() => {
    if (!mapRef.current || !osmAoiLayerRef.current) return;
    clearOsmAoiInteraction();
    setOsmAoiMode(true);
    setOsmDataError('');
    const draw = new Draw({
      source: osmAoiLayerRef.current.getSource(),
      type: osmAoiInputMode === 'rectangle' ? 'Circle' : 'Polygon',
      geometryFunction: osmAoiInputMode === 'rectangle' ? createBox() : undefined,
    });
    draw.on('drawstart', () => {
      osmAoiLayerRef.current?.getSource?.()?.clear?.();
      setOsmAoiBbox4326(null);
      setOsmAvailableDatasets([]);
      setOsmSelectedDatasets({});
    });
    draw.on('drawend', (event) => {
      clearOsmAoiInteraction();
      setOsmAoiMode(false);
      const geometry = event.feature?.getGeometry?.();
      if (!geometry) return;
      const bbox4326 = transformExtent(geometry.getExtent(), 'EPSG:3857', 'EPSG:4326');
      setOsmAoiBbox4326(bbox4326);
    });
    osmAoiDrawRef.current = draw;
    mapRef.current.addInteraction(draw);
  }, [
    clearOsmAoiInteraction,
    mapRef,
    osmAoiInputMode,
    osmAoiDrawRef,
    osmAoiLayerRef,
    setOsmAoiBbox4326,
    setOsmAoiMode,
    setOsmAvailableDatasets,
    setOsmDataError,
    setOsmSelectedDatasets,
  ]);

  const isGeometryInBuffer = useCallback((geometry, bufferPolygon) => {
    if (!geometry || !bufferPolygon) return false;
    const type = geometry.getType();
    if (type === 'Point') {
      return bufferPolygon.intersectsCoordinate(geometry.getCoordinates());
    }
    return bufferPolygon.intersectsExtent(geometry.getExtent());
  }, []);

  const getLayerFeaturesInsideBuffer = useCallback(async (selection, bufferPolygon) => {
    if (!selection || !bufferPolygon) return [];

    if (selection.startsWith('imported:')) {
      const importedId = selection.replace('imported:', '');
      const info = importedLayersRef.current.find((item) => item.id === importedId);
      const features = info?.layer?.getSource?.()?.getFeatures?.() || [];
      return features.filter((feature) => isGeometryInBuffer(feature.getGeometry(), bufferPolygon));
    }

    const layerCfg = layersConfigRef.current.find((layer) => layer.id === selection);
    if (!layerCfg?.layerName) return [];
    const extent = bufferPolygon.getExtent();
    const params = new URLSearchParams({
      service: 'WFS',
      version: '1.1.0',
      request: 'GetFeature',
      typeName: layerCfg.layerName,
      outputFormat: 'application/json',
      srsName: 'EPSG:3857',
      bbox: `${extent.join(',')},EPSG:3857`,
      maxFeatures: '2000',
    });
    const res = await fetch(`${geoserverProxyBase}/wfs?${params.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    const features = new GeoJSON().readFeatures(json, {
      dataProjection: 'EPSG:3857',
      featureProjection: 'EPSG:3857',
    });
    return features.filter((feature) => isGeometryInBuffer(feature.getGeometry(), bufferPolygon));
  }, [geoserverProxyBase, importedLayersRef, isGeometryInBuffer, layersConfigRef]);

  const requestBufferedGeometry = useCallback(async (inputGeometry, distance) => {
    const wkt3857 = new WKT().writeGeometry(inputGeometry);
    const json = await postJson(`${analysisApiBase}/buffer/`, {
      wkt: wkt3857,
      distance: Math.max(1, Number(distance) || 1),
      input_srid: 3857,
      output_srid: 3857,
    });
    if (!json?.geometry) throw new Error('Invalid buffer response.');
    return new GeoJSON().readGeometry(json.geometry, {
      dataProjection: 'EPSG:3857',
      featureProjection: 'EPSG:3857',
    });
  }, [analysisApiBase]);

  const runBufferWorkflow = useCallback(async ({ center, sourceGeometry = null }) => {
    if (!bufferLayerRef.current) return;
    const selectedLayer = bufferTargetLayerRef.current;
    if (!selectedLayer) {
      setBufferError('Select a layer first.');
      return;
    }
    const source = bufferLayerRef.current.getSource();
    if (!source) return;

    setBufferLoading(true);
    setBufferError('');
    clearBufferSelectionFilter();
    source.clear();

    const geometryForBuffer = sourceGeometry || new Point(center);

    if (sourceGeometry) {
      const sourceFeature = new Feature(sourceGeometry.clone());
      sourceFeature.set('kind', 'source');
      source.addFeature(sourceFeature);
    }

    try {
      const distance = Math.max(1, Number(bufferDistanceRef.current) || 1);
      const bufferGeometry = await requestBufferedGeometry(geometryForBuffer, distance);
      const bufferPolygon = bufferGeometry.getType() === 'Polygon'
        ? bufferGeometry
        : bufferGeometry.getType() === 'MultiPolygon'
          ? bufferGeometry
          : null;
      if (!bufferPolygon) {
        throw new Error('Buffer geometry is not polygonal.');
      }
      const bufferFeature = new Feature(bufferPolygon.clone());
      bufferFeature.set('kind', 'buffer');
      source.addFeature(bufferFeature);

      const matched = await getLayerFeaturesInsideBuffer(selectedLayer, bufferPolygon);
      setBufferResultCount(matched.length);
      matched.forEach((feature) => {
        const item = new Feature(feature.getGeometry().clone());
        item.set('kind', 'result');
        source.addFeature(item);
      });

      if (selectedLayer.startsWith('imported:')) {
        const importedId = selectedLayer.replace('imported:', '');
        const importedInfo = importedLayersRef.current.find((item) => item.id === importedId);
        const wasVisible = importedInfo?.layer?.getVisible?.() ?? true;
        importedInfo?.layer?.setVisible(false);
        bufferFilteredStateRef.current = { type: 'imported', layerId: importedId, wasVisible };
      } else {
        const sourceLayer = layersRef.current[selectedLayer];
        const wasVisible = sourceLayer?.getVisible?.() ?? true;
        sourceLayer?.setVisible(false);
        bufferFilteredStateRef.current = { type: 'geoserver', layerId: selectedLayer, wasVisible };
      }

      const columns = [];
      const rows = matched.map((feature) => {
        const props = { ...feature.getProperties() };
        delete props.geometry;
        Object.keys(props).forEach((key) => {
          if (!columns.includes(key)) columns.push(key);
        });
        return props;
      });

      const selectedLayerInfo = selectedLayer.startsWith('imported:')
        ? importedLayersRef.current.find((item) => `imported:${item.id}` === selectedLayer)
        : layersConfigRef.current.find((item) => item.id === selectedLayer);

      setAttributeData({
        columns,
        rows,
        message: matched.length ? '' : 'No records found inside buffer.',
      });
      setActiveAttributeLayer(selectedLayerInfo?.title || 'Buffer Result');
      setAttributeMeta({
        source: selectedLayer.startsWith('imported:') ? 'imported' : 'geoserver',
        layerId: selectedLayer.startsWith('imported:')
          ? selectedLayer.replace('imported:', '')
          : (selectedLayerInfo?.apiLayer || ''),
        rowFeatures: matched,
      });
      bufferAttributesAppliedRef.current = true;
      clearHoverHighlight();
      setActiveTab('attributes');
      setBufferMode(false);
    } catch (error) {
      setBufferError(error.message || 'Failed to fetch layer geometries in buffer.');
      setBufferResultCount(0);
      bufferAttributesAppliedRef.current = false;
    } finally {
      setBufferLoading(false);
    }
  }, [
    bufferAttributesAppliedRef,
    bufferDistanceRef,
    bufferFilteredStateRef,
    bufferLayerRef,
    bufferTargetLayerRef,
    clearBufferSelectionFilter,
    clearHoverHighlight,
    getLayerFeaturesInsideBuffer,
    importedLayersRef,
    layersConfigRef,
    layersRef,
    requestBufferedGeometry,
    setActiveAttributeLayer,
    setActiveTab,
    setAttributeData,
    setAttributeMeta,
    setBufferError,
    setBufferLoading,
    setBufferMode,
    setBufferResultCount,
  ]);

  const focusSelectedBufferLayer = useCallback((selection) => {
    if (!selection) return;
    if (selection.startsWith('imported:')) {
      const targetId = selection.replace('imported:', '');
      setLayersConfig((prev) => prev.map((layer) => ({ ...layer, visible: false })));
      Object.values(layersRef.current).forEach((layer) => layer?.setVisible(false));
      setImportedLayers((prev) =>
        prev.map((layerInfo) => ({ ...layerInfo, visible: layerInfo.id === targetId }))
      );
      importedLayersRef.current.forEach((layerInfo) => {
        layerInfo.layer?.setVisible(layerInfo.id === targetId);
      });
      return;
    }

    setImportedLayers((prev) => prev.map((layerInfo) => ({ ...layerInfo, visible: false })));
    importedLayersRef.current.forEach((layerInfo) => {
      layerInfo.layer?.setVisible(false);
    });
    setLayersConfig((prev) =>
      prev.map((layer) => ({
        ...layer,
        visible: layer.id === selection,
      }))
    );
    Object.entries(layersRef.current).forEach(([id, layer]) => {
      layer?.setVisible(id === selection);
    });
  }, [importedLayersRef, layersRef, setImportedLayers, setLayersConfig]);

  const startBufferMode = useCallback((forcedLayer = '') => {
    const targetLayer = forcedLayer || bufferTargetLayer;
    if (!targetLayer) {
      setBufferError('Select a layer first.');
      return;
    }
    if (forcedLayer && forcedLayer !== bufferTargetLayer) {
      setBufferTargetLayer(forcedLayer);
    }
    setBufferMode(true);
    setBufferError('');
    setRoutingMode(false);
    setProfileMode(false);
    setLulcAoiMode(false);
    if (mapRef.current && aoiDrawRef.current) {
      mapRef.current.removeInteraction(aoiDrawRef.current);
      aoiDrawRef.current = null;
    }

    if (!mapRef.current || !bufferLayerRef.current) return;
    if (bufferDrawRef.current) {
      mapRef.current.removeInteraction(bufferDrawRef.current);
      bufferDrawRef.current = null;
    }
    if (bufferInputMode === 'polygon' || bufferInputMode === 'rectangle') {
      const draw = new Draw({
        source: bufferLayerRef.current.getSource(),
        type: bufferInputMode === 'rectangle' ? 'Circle' : 'Polygon',
        geometryFunction: bufferInputMode === 'rectangle' ? createBox() : undefined,
      });
      draw.on('drawstart', () => {
        bufferLayerRef.current?.getSource().clear();
      });
      draw.on('drawend', (event) => {
        if (mapRef.current && bufferDrawRef.current) {
          mapRef.current.removeInteraction(bufferDrawRef.current);
          bufferDrawRef.current = null;
        }
        const geom = event.feature?.getGeometry();
        if (!geom) return;
        const extent = geom.getExtent();
        const center = [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2];
        runBufferWorkflow({ center, sourceGeometry: geom });
      });
      bufferDrawRef.current = draw;
      mapRef.current.addInteraction(draw);
    }
  }, [
    aoiDrawRef,
    bufferDrawRef,
    bufferInputMode,
    bufferLayerRef,
    bufferTargetLayer,
    mapRef,
    runBufferWorkflow,
    setBufferError,
    setBufferMode,
    setBufferTargetLayer,
    setLulcAoiMode,
    setProfileMode,
    setRoutingMode,
  ]);

  const handleTabSelect = useCallback((key, setActiveTabState, setRasterEnabled, setRasterCompareEnabled) => {
    if (!key) return;
    setActiveTabState(key);
    if (key === 'raster') {
      clearHeatmap();
      clearSpatialQuery();
      clearOsmDataTool();
    } else {
      setRasterEnabled(false);
      setRasterCompareEnabled(false);
    }
    if (key !== 'analysis') {
      setBufferMode(false);
    }
  }, [clearHeatmap, clearOsmDataTool, clearSpatialQuery, setBufferMode]);

  return {
    clearBufferSelectionFilter,
    clearHeatmap,
    clearSpatialQuery,
    clearOsmDataTool,
    clearBuffer,
    buildHeatmap,
    executeSpatialQuery,
    runSpatialQuery,
    requestOsmAvailability,
    importSelectedOsmData,
    startOsmAoiMode,
    runBufferWorkflow,
    focusSelectedBufferLayer,
    startBufferMode,
    handleTabSelect,
  };
}
