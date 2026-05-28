// import 'ol/ol.css';
import './MapView.css';
import { useCallback, useEffect, useRef, useState } from 'react';

import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import VectorLayer from 'ol/layer/Vector';
import HeatmapLayer from 'ol/layer/Heatmap';
import WebGLTileLayer from 'ol/layer/WebGLTile';
import TileWMS from 'ol/source/TileWMS';
import VectorSource from 'ol/source/Vector';
import GeoTIFF from 'ol/source/GeoTIFF';
import Overlay from 'ol/Overlay';

import { fromLonLat, transformExtent } from 'ol/proj';
import GeoJSON from 'ol/format/GeoJSON';
import LineString from 'ol/geom/LineString';
import Point from 'ol/geom/Point';
import Feature from 'ol/Feature';
import { Fill, Stroke, Style, Circle, Text } from 'ol/style';

import Tabs from 'react-bootstrap/Tabs';
import Tab from 'react-bootstrap/Tab';
import Cesium3DView from './Cesium3DView';
import { BASEMAP_OPTIONS } from './basemaps';
import { postJson } from './utils/api';
import LayersTab from './components/LayersTab';
import AttributesTab from './components/AttributesTab';
import QueryTab from './components/QueryTab';
import AnalysisTab from './components/AnalysisTab';
import RasterTab from './components/RasterTab';
import ThreeDTab from './components/ThreeDTab';
import useLayers from './hooks/useLayers';
import useAttributeControls from './hooks/useAttributeControls';
import useRasterControls from './hooks/useRasterControls';
import useAnalysisControls from './hooks/useAnalysisControls';
import useRoutingLulcControls from './hooks/useRoutingLulcControls';
import useFeatureInteractions from './hooks/useFeatureInteractions';
/* =========================
   Layer Configuration (moved to utils/mapConstants.js)
========================= */
import {
  INITIAL_LAYERS,
  threeD_layers,
  LULC_YEARS,
  LULC_LEGEND,
  RASTER_DATASET_OPTIONS,
  SPATIAL_QUERY_OPERATORS,
  OSM_DATASETS,
  CHAT_QUICK_PROMPTS,
  MAX_ATTRIBUTE_SLD_RULES,
  NAMED_STYLES_STORAGE_KEY,
  LAYER_STYLES_STORAGE_KEY,
  LAYER_STYLE_SELECTION_STORAGE_KEY,
  DEFAULT_NAMED_STYLES,
} from './utils/mapConstants';

import { createBasemapSource } from './utils/basemaps';


import {
  normalizeLayerStyle,
  loadLocalNamedStyles,
  loadLocalLayerStyleMap,
  loadLocalLayerSelections,
  styleConfigToSldBody,
  loadStyleConfig,
  setStyleConfigCache,
} from './utils/styleUtils';

// DEFAULT_NAMED_STYLES moved to ./utils/mapConstants.js

const serializeStyleState = ({ namedStyles, layersConfig, layerStyleSelections }) =>
  JSON.stringify({
    named_styles: namedStyles,
    layer_styles: layersConfig.reduce((acc, layer) => {
      acc[layer.id] = normalizeLayerStyle(layer.style);
      return acc;
    }, {}),
    layer_style_selections: layerStyleSelections,
  });


export default function MapView() {
  const GEOSERVER_PROXY_BASE = 'http://192.168.20.57:7000/api/geoserver';
  const RASTER_API_BASE = 'http://192.168.20.57:7000/api/raster';
  const THREE_D_TILES_API_BASE = 'http://192.168.20.57:7000/api/3d-tiles';
  const STYLES_API_BASE = 'http://192.168.20.57:7000/api/styles';
  const ANALYSIS_API_BASE = 'http://192.168.20.57:7000/api/analysis';
  const OSM_QUERY_API = 'http://192.168.20.57:7000/api/osm/query/';
  const CHAT_API_URL = 'http://192.168.20.57:7000/api/chat/';
  const mapRef = useRef(null);
  const layersRef = useRef({});
  const popupRef = useRef(null);
  const popupOverlayRef = useRef(null);
  const popupDraggingRef = useRef(false);
  const popupDragOffsetRef = useRef([0, 0]);
  const basemapPickerRef = useRef(null);
  const chatAssistantRef = useRef(null);
  const highlightLayerRef = useRef(null);
  const hoverHighlightLayerRef = useRef(null);
  const profileLineLayerRef = useRef(null);
  const routingLayerRef = useRef(null);
  const bufferLayerRef = useRef(null);
  const spatialQueryLayerRef = useRef(null);
  const heatmapLayerRef = useRef(null);
  const osmAoiLayerRef = useRef(null);
  const bufferDrawRef = useRef(null);
  const osmAoiDrawRef = useRef(null);
  const aoiLayerRef = useRef(null);
  const aoiDrawRef = useRef(null);
  const baseLayerRef = useRef(null);
  const rasterLayerRef = useRef(null);
  const rasterCompareLayerRef = useRef(null);
  const rasterImportLayerRef = useRef(null);
  const rasterImportCompareLayerRef = useRef(null);
  const rasterImportUrlRef = useRef(null);
  const rasterSplitRef = useRef(0.5);
  const rasterCompareEnabledRef = useRef(false);
  const rasterDraggingRef = useRef(false);
  const layersConfigRef = useRef(INITIAL_LAYERS);
  const nonRasterVisibilityRef = useRef({ base: true, geoserver: {}, imported: {} });
  const lastTabRef = useRef('layers');
  const activeTabRef = useRef('layers');
  const rasterThemeRef = useRef('LULC');
  const uploadedCompareEnabledRef = useRef(false);
  const uploadedRightRef = useRef('');
  const profileModeRef = useRef(false);
  const profileDemRef = useRef('');
  const profilePointsRef = useRef([]);
  const demRastersRef = useRef([]);
  const routingModeRef = useRef(false);
  const bufferModeRef = useRef(false);
  const bufferInputModeRef = useRef('center_click');
  const bufferDistanceRef = useRef(250);
  const bufferTargetLayerRef = useRef('');
  const bufferFilteredStateRef = useRef(null);
  const bufferAttributesAppliedRef = useRef(false);
  const buildElevationProfileRef = useRef(null);
  const buildRoutingPathRef = useRef(null);
  const runBufferWorkflowRef = useRef(null);
  const addVectorLayerFromGeoJSONRef = useRef(null);
  const routingPointsRef = useRef([]);
  const aoiModeRef = useRef(false);
  const rasterViewExtentRef = useRef(null);
  const importedRasterVisibleRef = useRef(false);
  const wfsCacheRef = useRef(new Map());
  const chatFilterContextRef = useRef(null);

  const [layersConfig, setLayersConfig] = useState(INITIAL_LAYERS);
  const stylesHydratedRef = useRef(false);
  const lastPersistedStylesRef = useRef('');
  const [attributeData, setAttributeData] = useState(null);
  const [featureInfo, setFeatureInfo] = useState(null);
  const [attributeMeta, setAttributeMeta] = useState(null);
  const [attributeSortKey, setAttributeSortKey] = useState('');
  const [attributeSortDir, setAttributeSortDir] = useState('asc');
  const [attributeSearch, setAttributeSearch] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [attributeMenuOpen, setAttributeMenuOpen] = useState(false);
  const [attributeMenuColumn, setAttributeMenuColumn] = useState('');

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTab, setActiveTab] = useState('layers');
  const [active3DLayers, setActive3DLayers] = useState(() => threeD_layers.map((layer) => layer.id));
  const [threeDAnalysisTool, setThreeDAnalysisTool] = useState('line-of-sight');
  const [threeDAnalysisStartToken, setThreeDAnalysisStartToken] = useState(0);
  const [threeDAnalysisClearToken, setThreeDAnalysisClearToken] = useState(0);
  const [threeDStylingAttribute, setThreeDStylingAttribute] = useState('default');
  const [threeDObserverHeight, setThreeDObserverHeight] = useState('');
  const [threeDViewshedRange, setThreeDViewshedRange] = useState('');
  const [undergroundMode, setUndergroundMode] = useState(false);
  const [flyToLayerToken, setFlyToLayerToken] = useState(0);
  const [targetLayerIdToFly, setTargetLayerIdToFly] = useState(null);
  const [imported3DTiles, setImported3DTiles] = useState([]);
  const [threeDImportFiles, setThreeDImportFiles] = useState([]);
  const [threeDImportName, setThreeDImportName] = useState('');
  const [threeDImportHeightColumn, setThreeDImportHeightColumn] = useState('');
    const [threeDImportDiameterColumn, setThreeDImportDiameterColumn] = useState('');
  const [threeDImportFields, setThreeDImportFields] = useState([]);
  const [threeDInspectLoading, setThreeDInspectLoading] = useState(false);
  const [threeDImportCrs, setThreeDImportCrs] = useState('4326');
  const [threeDImportLoading, setThreeDImportLoading] = useState(false);
  const [threeDImportError, setThreeDImportError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedBasemap, setSelectedBasemap] = useState('osm');
  const [selected3DBasemap, setSelected3DBasemap] = useState('satellite');
  const [basemapPickerOpen, setBasemapPickerOpen] = useState(false);
  const [chatAssistantOpen, setChatAssistantOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      text: 'Ask about roads, canals, landmarks, and analysis tools on this map.',
    },
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  const [query, setQuery] = useState({
    field: '',
    operator: '=',
    value: '',
  });
  const [queryDistinctValues, setQueryDistinctValues] = useState([]);
  const [queryDistinctLoading, setQueryDistinctLoading] = useState(false);
  const [namedStyles, setNamedStyles] = useState(DEFAULT_NAMED_STYLES);
  const [addingStyleForLayer, setAddingStyleForLayer] = useState('');
  const [attributeStyleColumns, setAttributeStyleColumns] = useState({});
  const [attributeStyleDrafts, setAttributeStyleDrafts] = useState({});
  const [attributeStyleDistinctValues, setAttributeStyleDistinctValues] = useState({});
  const [attributeStyleDistinctLoading, setAttributeStyleDistinctLoading] = useState({});
  const [styleEditorMode, setStyleEditorMode] = useState('add');
  const [, setEditingStyleName] = useState('');
  const [newStyleName, setNewStyleName] = useState('');
  const [newStyleDraft, setNewStyleDraft] = useState({
    strokeColor: '#2563eb',
    fillColor: '#2563eb',
    strokeWidth: 2,
    opacity: 1,
  });
  const [layerStyleSelections, setLayerStyleSelections] = useState(() =>
    Object.fromEntries(INITIAL_LAYERS.map((layer) => [layer.id, '']))
  );

  const [importedLayers, setImportedLayers] = useState([]);
  const importedLayersRef = useRef([]);
  const [activeAttributeLayer, setActiveAttributeLayer] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load3DTiles = async () => {
      try {
        const response = await fetch(`${THREE_D_TILES_API_BASE}/list/`);
        if (!response.ok) return;
        const json = await response.json();
        if (!cancelled) {
          setImported3DTiles(Array.isArray(json.items) ? json.items : []);
        }
      } catch {
        // The 3D import API may be offline during frontend-only development.
      }
    };
    load3DTiles();
    return () => {
      cancelled = true;
    };
  }, [THREE_D_TILES_API_BASE]);

  const inspectThreeDAttributes = useCallback(async (files) => {
    const selectedFiles = Array.from(files || []);
    setThreeDImportFiles(selectedFiles);
    setThreeDImportFields([]);
    setThreeDImportHeightColumn('');
    setThreeDImportDiameterColumn('');
    setThreeDImportError('');

    if (!selectedFiles.length) {
      return;
    }

    const formData = new FormData();
    selectedFiles.forEach((file) => formData.append('files', file));

    setThreeDInspectLoading(true);
    try {
      const response = await fetch(`${THREE_D_TILES_API_BASE}/attributes/`, {
        method: 'POST',
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || 'Unable to read shapefile attributes.');
      }

      const fields = Array.isArray(json.fields) ? json.fields : [];
      const suggestions = json.suggestions || {};
      setThreeDImportFields(fields);
      setThreeDImportHeightColumn(suggestions.heightColumn || '');
      setThreeDImportDiameterColumn(suggestions.diameterColumn || '');
    } catch (err) {
      setThreeDImportError(err.message || 'Unable to read shapefile attributes.');
    } finally {
      setThreeDInspectLoading(false);
    }
  }, [THREE_D_TILES_API_BASE]);

  const importThreeDTiles = useCallback(async () => {
    const files = Array.from(threeDImportFiles || []);
    setThreeDImportError('');

    const hasShp = files.some((file) => file.name.toLowerCase().endsWith('.shp'));
    const hasZip = files.some((file) => file.name.toLowerCase().endsWith('.zip'));
    if (!hasShp && !hasZip) {
      setThreeDImportError('Select a .shp file or ZIP archive to create 3D tiles.');
      return;
    }
    if (hasShp && hasZip) {
      setThreeDImportError('Upload either a .shp file or a ZIP archive, not both.');
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    formData.append('name', threeDImportName);
    formData.append('heightColumn', threeDImportHeightColumn || '');
    formData.append('diameterColumn', threeDImportDiameterColumn || '');
    formData.append('crs', threeDImportCrs || '4326');

    setThreeDImportLoading(true);
    try {
      const response = await fetch(`${THREE_D_TILES_API_BASE}/import/`, {
        method: 'POST',
        body: formData,
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const msg = json.error || '3D tile import failed.';
        const details = [json.stdout, json.stderr].filter(Boolean).join('\n').slice(-2000);
        throw new Error(details ? `${msg}\n${details}` : msg);
      }

      setImported3DTiles((prev) => [json, ...prev.filter((item) => item.id !== json.id)]);
      setActive3DLayers((prev) => (prev.includes(json.id) ? prev : [...prev, json.id]));
      setThreeDImportFiles([]);
      setThreeDImportFields([]);
      setThreeDImportHeightColumn('');
      setThreeDImportDiameterColumn('');
      setThreeDImportName('');
    } catch (err) {
      setThreeDImportError(err.message || '3D tile import failed.');
    } finally {
      setThreeDImportLoading(false);
    }
  }, [
    THREE_D_TILES_API_BASE,
    threeDImportCrs,
    threeDImportDiameterColumn,
    threeDImportFiles,
    threeDImportHeightColumn,
    threeDImportName,
  ]);

  const flyToLayer = useCallback((layerId) => {
    debugger
    setTargetLayerIdToFly(layerId);
    setFlyToLayerToken((t) => t + 1);
  }, []);

  const delete3DLayer = useCallback(async (layerId) => {
    try {
      const response = await fetch(`${THREE_D_TILES_API_BASE}/delete/${layerId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || 'Delete failed.');
      }
      setImported3DTiles((prev) => prev.filter((l) => l.id !== layerId));
      setActive3DLayers((prev) => prev.filter((id) => id !== layerId));
    } catch (err) {
      console.error('Failed to delete 3D layer:', err);
    }
  }, [THREE_D_TILES_API_BASE]);

  useEffect(() => {
    let cancelled = false;
    const loadSharedStyles = async () => {
      try {
        const json = await loadStyleConfig(STYLES_API_BASE);
        if (cancelled) return;

        const remoteNamedStyles = Array.isArray(json.named_styles)
          ? json.named_styles
            .filter((item) => item && typeof item.name === 'string' && item.style)
            .map((item) => ({ name: item.name, style: normalizeLayerStyle(item.style) }))
          : [];
        if (remoteNamedStyles.length) {
          setNamedStyles(remoteNamedStyles);
        }

        const remoteLayerStyles = json.layer_styles && typeof json.layer_styles === 'object'
          ? json.layer_styles
          : {};
        setLayersConfig((prev) =>
          prev.map((layer) => ({
            ...layer,
            style: normalizeLayerStyle(remoteLayerStyles[layer.id] || layer.style),
          }))
        );

        const remoteSelections = json.layer_style_selections && typeof json.layer_style_selections === 'object'
          ? json.layer_style_selections
          : {};
        setLayerStyleSelections((prev) =>
          Object.fromEntries(
            Object.keys(prev).map((id) => [id, typeof remoteSelections[id] === 'string' ? remoteSelections[id] : prev[id]])
          )
        );

        lastPersistedStylesRef.current = serializeStyleState({
  
          namedStyles: remoteNamedStyles.length ? remoteNamedStyles : DEFAULT_NAMED_STYLES,
          layersConfig: INITIAL_LAYERS.map((layer) => ({
        
            ...layer,
            style: normalizeLayerStyle(remoteLayerStyles[layer.id] || layer.style),
          })),
          layerStyleSelections: Object.fromEntries(
            
            INITIAL_LAYERS.map((layer) => [
              layer.id,
              typeof remoteSelections[layer.id] === 'string' ? remoteSelections[layer.id] : '',
            ])
          ),
        });
      } catch {
        if (!cancelled) {
          const localNamed = loadLocalNamedStyles(NAMED_STYLES_STORAGE_KEY);
          const resolvedNamedStyles = localNamed.length ? localNamed : DEFAULT_NAMED_STYLES;
          if (localNamed.length) setNamedStyles(localNamed);
          const localStyleMap = loadLocalLayerStyleMap(LAYER_STYLES_STORAGE_KEY);
          setLayersConfig((prev) =>
            prev.map((layer) => ({
              ...layer,
              style: normalizeLayerStyle(localStyleMap[layer.id] || layer.style),
            }))
          );
          const localSelections = loadLocalLayerSelections(LAYER_STYLE_SELECTION_STORAGE_KEY);
          setLayerStyleSelections((prev) =>
            Object.fromEntries(
              Object.keys(prev).map((id) => [id, typeof localSelections[id] === 'string' ? localSelections[id] : prev[id]])
            )
          );
          lastPersistedStylesRef.current = serializeStyleState({
            namedStyles: resolvedNamedStyles,
            layersConfig: INITIAL_LAYERS.map((layer) => ({
              ...layer,
              style: normalizeLayerStyle(localStyleMap[layer.id] || layer.style),
            })),
            layerStyleSelections: Object.fromEntries(
              INITIAL_LAYERS.map((layer) => [
                layer.id,
                typeof localSelections[layer.id] === 'string' ? localSelections[layer.id] : '',
              ])
            ),
          });
        }
      } finally {
        if (!cancelled) {
          stylesHydratedRef.current = true;
        }
      }
    };
    loadSharedStyles();
    return () => {
      cancelled = true;
    };
  }, [STYLES_API_BASE]);

  useEffect(() => {
    if (!stylesHydratedRef.current) return;
    const timerId = setTimeout(async () => {
      const serializedState = serializeStyleState({
        namedStyles,
        layersConfig,
        layerStyleSelections,
      });
      if (serializedState === lastPersistedStylesRef.current) return;

      const payload = JSON.parse(serializedState);
        try {
        await fetch(`${STYLES_API_BASE}/config/`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: serializedState,
        });
        setStyleConfigCache(STYLES_API_BASE, payload);
        lastPersistedStylesRef.current = serializedState;
      } catch {
        // Fallback to browser local storage when backend style API is unavailable.
        try {
          window.localStorage.setItem(NAMED_STYLES_STORAGE_KEY, JSON.stringify(namedStyles));
          window.localStorage.setItem(LAYER_STYLES_STORAGE_KEY, JSON.stringify(payload.layer_styles));
          window.localStorage.setItem(
            LAYER_STYLE_SELECTION_STORAGE_KEY,
            JSON.stringify(layerStyleSelections)
          );
          lastPersistedStylesRef.current = serializedState;
        } catch {
          // ignore storage failures; retry on next change
        }
      }
    }, 450);
    return () => clearTimeout(timerId);
  }, [namedStyles, layersConfig, layerStyleSelections, STYLES_API_BASE]);

  const [rasterEnabled, setRasterEnabled] = useState(false);
  const [rasterCompareEnabled, setRasterCompareEnabled] = useState(false);
  const [rasterStartYear, setRasterStartYear] = useState(2024);
  const [rasterEndYear, setRasterEndYear] = useState(2025);
  const [rasterSplit, setRasterSplit] = useState(0.5);
  const [rasterAnalysisOpen, setRasterAnalysisOpen] = useState(false);
  const [rasterMode, setRasterMode] = useState('swipe'); // swipe | step
  const [rasterTheme, setRasterTheme] = useState('LULC');
  const [importedRasterVisible, setImportedRasterVisible] = useState(false);
  const [uploadedDataset, setUploadedDataset] = useState('DEM');
  const [uploadedDateTime, setUploadedDateTime] = useState('');
  const [uploadedRasters, setUploadedRasters] = useState([]);
  const [uploadedLeft, setUploadedLeft] = useState('');
  const [uploadedRight, setUploadedRight] = useState('');
  const [uploadedCompareEnabled, setUploadedCompareEnabled] = useState(false);
  const [uploadedSwipeEnabled, setUploadedSwipeEnabled] = useState(false);
  const [demRasters, setDemRasters] = useState([]);
  const [profileDem, setProfileDem] = useState('');
  const [profileMode, setProfileMode] = useState(false);
  const [profilePoints, setProfilePoints] = useState([]);
  const [profileData, setProfileData] = useState([]);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileHover, setProfileHover] = useState(null);

  const [routingMode, setRoutingMode] = useState(false);
  const [routingPoints, setRoutingPoints] = useState([]);
  const [bufferMode, setBufferMode] = useState(false);
  const [analysisTool, setAnalysisTool] = useState('buffer');
  const [bufferInputMode, setBufferInputMode] = useState('center_click');
  const [bufferDistance, setBufferDistance] = useState(250);
  const [bufferTargetLayer, setBufferTargetLayer] = useState('');
  const [bufferLoading, setBufferLoading] = useState(false);
  const [bufferError, setBufferError] = useState('');
  const [bufferResultCount, setBufferResultCount] = useState(0);
  const [heatmapTargetLayer, setHeatmapTargetLayer] = useState('');
  const [heatmapRadius, setHeatmapRadius] = useState(16);
  const [heatmapBlur, setHeatmapBlur] = useState(24);
  const [heatmapWeightField, setHeatmapWeightField] = useState('');
  const [heatmapFields, setHeatmapFields] = useState([]);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [heatmapError, setHeatmapError] = useState('');
  const [heatmapPointCount, setHeatmapPointCount] = useState(0);
  const [spatialQueryReferenceLayer, setSpatialQueryReferenceLayer] = useState('');
  const [spatialQueryTargetLayer, setSpatialQueryTargetLayer] = useState('');
  const [spatialQueryOperator, setSpatialQueryOperator] = useState('inside');
  const [spatialQueryDistance, setSpatialQueryDistance] = useState(100);
  const [spatialQueryLoading, setSpatialQueryLoading] = useState(false);
  const [spatialQueryError, setSpatialQueryError] = useState('');
  const [spatialQueryResultCount, setSpatialQueryResultCount] = useState(0);
  const [osmAoiMode, setOsmAoiMode] = useState(false);
  const [osmAoiInputMode, setOsmAoiInputMode] = useState('polygon');
  const [osmAoiBbox4326, setOsmAoiBbox4326] = useState(null);
  const [osmAvailableDatasets, setOsmAvailableDatasets] = useState([]);
  const [osmSelectedDatasets, setOsmSelectedDatasets] = useState({});
  const [osmAvailabilityLoading, setOsmAvailabilityLoading] = useState(false);
  const [osmImportLoading, setOsmImportLoading] = useState(false);
  const [osmDataError, setOsmDataError] = useState('');
  const [routingToken, setRoutingToken] = useState('');
  const [routingLoading, setRoutingLoading] = useState(false);
  const [routingError, setRoutingError] = useState('26a67bb91922ac1f6fa17eb093cf70d6023f29f6');
  const [lulcToken, setLulcToken] = useState('6cc31dd46be854f340995b9c530f7c4e95c4fc7b');
  const [lulcStatsOpen, setLulcStatsOpen] = useState(false);
  const [lulcStatsLoading, setLulcStatsLoading] = useState(false);
  const [lulcStatsError, setLulcStatsError] = useState('');
  const [lulcStatsData, setLulcStatsData] = useState(null);
  const [lulcAoiWkt, setLulcAoiWkt] = useState('');
  const [lulcAoiMode, setLulcAoiMode] = useState(false);

  rasterSplitRef.current = rasterSplit;
  const compareRefState =
    rasterTheme === 'LULC'
      ? rasterCompareEnabled
      : uploadedCompareEnabled && uploadedSwipeEnabled;
  rasterCompareEnabledRef.current = compareRefState;
  importedRasterVisibleRef.current = importedRasterVisible;
  activeTabRef.current = activeTab;
  rasterThemeRef.current = rasterTheme;
  uploadedCompareEnabledRef.current = uploadedCompareEnabled;
  uploadedRightRef.current = uploadedRight;
  profileModeRef.current = profileMode;
  profileDemRef.current = profileDem;
  profilePointsRef.current = profilePoints;
  demRastersRef.current = demRasters;
  routingModeRef.current = routingMode;
  bufferModeRef.current = bufferMode;
  bufferInputModeRef.current = bufferInputMode;
  bufferDistanceRef.current = bufferDistance;
  bufferTargetLayerRef.current = bufferTargetLayer;
  routingPointsRef.current = routingPoints;
  aoiModeRef.current = lulcAoiMode;
  layersConfigRef.current = layersConfig;
  importedLayersRef.current = importedLayers;

  useEffect(() => {
    const compareSwipeActive =
      rasterTheme === 'LULC'
        ? rasterEnabled && rasterCompareEnabled && rasterMode === 'swipe'
        : importedRasterVisible && uploadedCompareEnabled && uploadedSwipeEnabled;
    if (mapRef.current && compareSwipeActive) {
      mapRef.current.render();
    }
  }, [
    rasterSplit,
    rasterEnabled,
    rasterCompareEnabled,
    rasterMode,
    rasterTheme,
    importedRasterVisible,
    uploadedCompareEnabled,
    uploadedSwipeEnabled,
  ]);

  useEffect(() => {
    if (rasterTheme === 'UPLOAD') {
      setRasterEnabled(false);
      setRasterCompareEnabled(false);
      setRasterAnalysisOpen(false);
      setRasterMode('swipe');
    } else if (rasterTheme === 'LULC') {
      setUploadedCompareEnabled(false);
      setUploadedSwipeEnabled(false);
      setProfileMode(false);
      setProfilePoints([]);
      setProfileData([]);
      setProfileError('');
      setProfileOpen(false);
    }
  }, [rasterTheme]);

  useEffect(() => {
    if (!rasterEnabled || rasterMode !== 'step') return;
    setRasterCompareEnabled(false);

    const years = LULC_YEARS.map((y) => y.year);
    if (!years.length) return;
    let index = Math.max(0, years.indexOf(rasterStartYear));

    const intervalId = setInterval(() => {
      index = (index + 1) % years.length;
      setRasterStartYear(years[index]);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [rasterEnabled, rasterMode, rasterStartYear]);

  useEffect(() => {
    Object.entries(layersRef.current).forEach(([id, layer]) => {
      const config = layersConfig.find((item) => item.id === id);
      if (!config || !layer) return;
      layer.setOpacity(config.style?.opacity ?? 1);
      const source = layer.getSource?.();
      if (source?.updateParams) {
        source.updateParams({
          LAYERS: config.layerName,
          TILED: true,
          SLD_BODY: styleConfigToSldBody(config.layerName, config.style, config.geometryType),
        });
      }
      if (activeTab !== 'raster') {
        const bufferedState = bufferFilteredStateRef.current;
        const isHiddenByBuffer =
          bufferedState?.type === 'geoserver' && bufferedState.layerId === id;
        layer.setVisible(isHiddenByBuffer ? false : config.visible);
      }
    });
  }, [layersConfig, activeTab]);

  /* =========================
     Helpers
  ========================= */
  const extentsIntersect = useCallback((a, b) => (
    a &&
    b &&
    a[0] < b[2] &&
    a[2] > b[0] &&
    a[1] < b[3] &&
    a[3] > b[1]
  ), []);

  const rasterTileLoadFunction = useCallback((source) => (tile, src) => {
    const currentExtent = rasterViewExtentRef.current;
    const tileGrid = source.getTileGrid();
    const tileCoord = tile.getTileCoord();
    if (!currentExtent || !tileGrid || !tileCoord) {
      tile.getImage().src = src;
      return;
    }

    const tileExtent = tileGrid.getTileCoordExtent(tileCoord);
    if (!extentsIntersect(currentExtent, tileExtent)) {
      tile.getImage().src =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQImWNgYGBgAAAABAABJzQnCgAAAABJRU5ErkJggg==';
      return;
    }

    tile.getImage().src = src;
  }, [extentsIntersect]);

  const applyRasterStyle = useCallback((layer) => {
    layer.setStyle({
      // Always render something: use band 1 as grayscale (works for single/multi-band).
      color: [
        'array',
        ['*', 255, ['band', 1]],
        ['*', 255, ['band', 1]],
        ['*', 255, ['band', 1]],
        255,
      ],
    });
  }, []);

  const createGeoTiffSource = useCallback((url, fitOnLoad) => {
    const source = new GeoTIFF({
      sources: [{ url }],
      normalize: true,
      interpolate: true,
      projection: 'EPSG:4326',
    });

    source.on('change', () => {
      if (source.getState() !== 'ready') return;
      if (!fitOnLoad) return;
      const map = mapRef.current;
      if (!map) return;
      const tileGrid = source.getTileGrid?.();
      const extent = tileGrid?.getExtent?.();
      if (!extent) {
        alert('This TIFF has no usable extent. Please use a GeoTIFF with proper georeferencing (CRS/extent).');
        return;
      }
      const sourceProj = source.getProjection();
      const targetProj = map.getView().getProjection();
      const extentToFit = sourceProj
        ? transformExtent(extent, sourceProj, targetProj)
        : extent;
      map.getView().fit(extentToFit, { padding: [20, 20, 20, 20], maxZoom: 18 });
    });

    return source;
  }, []);

  const rasterControls = useRasterControls({
    rasterApiBase: RASTER_API_BASE,
    uploadedDataset,
    uploadedDateTime,
    setUploadedDataset,
    setUploadedLeft,
    setUploadedRight,
    setUploadedCompareEnabled,
    setUploadedSwipeEnabled,
    setUploadedRasters,
    setImportedRasterVisible,
    rasterImportLayerRef,
    rasterImportCompareLayerRef,
    rasterImportUrlRef,
    setDemRasters,
    setProfileDem,
    setProfileMode,
    setProfilePoints,
    setProfileData,
    setProfileLoading,
    setProfileError,
    setProfileOpen,
    setProfileHover,
    profileLineLayerRef,
    setHeatmapRadius,
    heatmapLayerRef,
    setHeatmapBlur,
    updateRasterLayerState: () => mapRef.current?.render(),
    rasterEnabled,
    rasterCompareEnabled,
    rasterLayerRef,
    rasterCompareLayerRef,
  });
  const {
    fetchUploadedRasters,
    fetchDemRasters,
    buildElevationProfile,
    handleHeatmapRadiusChange,
    handleHeatmapBlurChange,
    handleUploadedDatasetChange,
    clearImportedRaster,
    handleRasterImport,
    startProfileMode,
    clearProfile,
    updateRasterLayer,
    updateRasterCompareLayer,
  } = rasterControls;

  const routingLulcControls = useRoutingLulcControls({
    geoserverProxyBase: GEOSERVER_PROXY_BASE,
    routingToken,
    routingLayerRef,
    setRoutingPoints,
    setRoutingError,
    setRoutingLoading,
    setLulcAoiWkt,
    setLulcStatsData,
    setLulcStatsError,
    setLulcStatsLoading,
    setLulcAoiMode,
    aoiLayerRef,
    mapRef,
    aoiDrawRef,
    lulcToken,
    setLulcStatsOpen,
  });
  const {
    clearRouting,
    buildRoutingPath,
    clearLulcAoi,
    startLulcAoiDraw,
  } = routingLulcControls;

  const featureInteractions = useFeatureInteractions({
    mapRef,
    popupOverlayRef,
    popupDragOffsetRef,
    popupDraggingRef,
    highlightLayerRef,
    hoverHighlightLayerRef,
    setFeatureInfo,
  });
  const {
    closePopup,
    onPopupMouseDown,
    clearHoverHighlight,
    highlightHoverFeature,
    zoomToFeature,
  } = featureInteractions;

  useEffect(() => {
    if (rasterTheme !== 'UPLOAD') return;
    fetchUploadedRasters(uploadedDataset);
  }, [fetchUploadedRasters, rasterTheme, uploadedDataset]);

  useEffect(() => {
    if (rasterTheme !== 'UPLOAD') return;
    if (demRastersRef.current.length) return;
    fetchDemRasters();
  }, [fetchDemRasters, rasterTheme]);

  const fetchAttributeStyleColumns = useCallback(async (layerCfg) => {
    if (!layerCfg?.apiLayer) return;
    if (Array.isArray(attributeStyleColumns[layerCfg.id]) && attributeStyleColumns[layerCfg.id].length) {
      return;
    }
    try {
      const res = await fetch(`http://192.168.20.57:7000/api/attributes/?layer=${layerCfg.apiLayer}&limit=1`);
      const json = await res.json();
      const cols = Array.isArray(json?.columns) ? json.columns : [];
      setAttributeStyleColumns((prev) => ({ ...prev, [layerCfg.id]: cols }));
    } catch {
      setAttributeStyleColumns((prev) => ({ ...prev, [layerCfg.id]: [] }));
    }
  }, [attributeStyleColumns]);

  useEffect(() => {
    if (!addingStyleForLayer) return undefined;
    const layerCfg = layersConfig.find((layer) => layer.id === addingStyleForLayer);
    const draft = attributeStyleDrafts[addingStyleForLayer];
    if (!layerCfg?.apiLayer || !draft?.field) {
      setAttributeStyleDistinctValues((prev) => ({ ...prev, [addingStyleForLayer]: [] }));
      setAttributeStyleDistinctLoading((prev) => ({ ...prev, [addingStyleForLayer]: false }));
      return undefined;
    }

    const controller = new AbortController();
    const timerId = setTimeout(async () => {
      setAttributeStyleDistinctLoading((prev) => ({ ...prev, [addingStyleForLayer]: true }));
      try {
        const params = new URLSearchParams({
          layer: layerCfg.apiLayer,
          field: draft.field,
          limit: '100',
        });
        if (draft.value.trim()) params.set('q', draft.value.trim());
        const res = await fetch(
          `http://192.168.20.57:7000/api/attributes/distinct/?${params.toString()}`,
          { signal: controller.signal }
        );
        const json = await res.json();
        if (!controller.signal.aborted) {
          setAttributeStyleDistinctValues((prev) => ({
            ...prev,
            [addingStyleForLayer]: Array.isArray(json.values) ? json.values.map((v) => String(v)) : [],
          }));
        }
      } catch {
        if (!controller.signal.aborted) {
          setAttributeStyleDistinctValues((prev) => ({ ...prev, [addingStyleForLayer]: [] }));
        }
      } finally {
        if (!controller.signal.aborted) {
          setAttributeStyleDistinctLoading((prev) => ({ ...prev, [addingStyleForLayer]: false }));
        }
      }
    }, 220);

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [addingStyleForLayer, attributeStyleDrafts, layersConfig]);

  const fetchAttributes = useCallback(async (layer, cql = null, title = null) => {
    let url = `http://192.168.20.57:7000/api/attributes/?layer=${layer}&limit=50`;
    if (cql) url += `&cql=${encodeURIComponent(cql)}`;

    try {
      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || data.error) {
        setAttributeData({
          columns: [],
          rows: [],
          message: 'Data not available for this layer',
        });
        setActiveAttributeLayer(title);
        setAttributeMeta({ source: 'geoserver', layerId: layer, rowFeatures: null });
        clearHoverHighlight();
        return;
      }

      setAttributeData(data);
      setActiveAttributeLayer(title);
      setAttributeMeta({ source: 'geoserver', layerId: layer, rowFeatures: null });
      clearHoverHighlight();
    } catch {
      setAttributeData({
        columns: [],
        rows: [],
        message: 'Failed to load attributes',
      });
      setActiveAttributeLayer(title);
      setAttributeMeta({ source: 'geoserver', layerId: layer, rowFeatures: null });
      clearHoverHighlight();
    }
  }, [clearHoverHighlight]);

  const attributeControls = useAttributeControls({
    attributeData,
    attributeMeta,
    attributeSearch,
    setAttributeSearch,
    hiddenColumns,
    setHiddenColumns,
    attributeSortKey,
    setAttributeSortKey,
    attributeSortDir,
    setAttributeSortDir,
    setAttributeMenuOpen,
    setAttributeMenuColumn,
    query,
    setQuery,
    setQueryDistinctValues,
    setQueryDistinctLoading,
    layersConfig,
    layersRef,
    fetchAttributes,
  });

  const setAttributesFromImportedLayer = (layerInfo) => {
    if (!layerInfo || !layerInfo.layer) return;

    const features = layerInfo.layer.getSource().getFeatures();
    if (!features.length) {
      setAttributeData({
        columns: [],
        rows: [],
        message: 'No features available in this layer',
      });
      setActiveAttributeLayer(layerInfo.title);
      setAttributeMeta({ source: 'imported', layerId: layerInfo.id, rowFeatures: [] });
      clearHoverHighlight();
      return;
    }

    const columns = [];
    const rows = features.map((feature) => {
      const props = { ...feature.getProperties() };
      delete props.geometry;
      Object.keys(props).forEach((key) => {
        if (!columns.includes(key)) columns.push(key);
      });
      return props;
    });

    setAttributeData({ columns, rows });
    setActiveAttributeLayer(layerInfo.title);
    setAttributeMeta({ source: 'imported', layerId: layerInfo.id, rowFeatures: features });
    clearHoverHighlight();
  };

  const analysisControls = useAnalysisControls({
    analysisApiBase: ANALYSIS_API_BASE,
    geoserverProxyBase: GEOSERVER_PROXY_BASE,
    osmQueryApi: OSM_QUERY_API,
    osmDatasets: OSM_DATASETS,
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
  });
  const {
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
    handleTabSelect: handleAnalysisTabSelect,
  } = analysisControls;

  const handleTabSelect = useCallback((key) => {
    handleAnalysisTabSelect(key, setActiveTab, setRasterEnabled, setRasterCompareEnabled);
  }, [handleAnalysisTabSelect]);
  buildElevationProfileRef.current = buildElevationProfile;
  runBufferWorkflowRef.current = runBufferWorkflow;
  buildRoutingPathRef.current = buildRoutingPath;

  const layersApi = useLayers({
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
    attributeStyleDistinctValues,
    setAttributeStyleDistinctValues,
    attributeStyleDistinctLoading,
    setAttributeStyleDistinctLoading,
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
  });
  addVectorLayerFromGeoJSONRef.current = layersApi.addVectorLayerFromGeoJSON;

  /* =========================
     Initialize Map (ONCE)
  ========================= */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    highlightLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({ color: '#ef4444', width: 3 }),
        fill: new Fill({ color: 'rgba(239,68,68,0.2)' }),
      }),
    });

    hoverHighlightLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({ color: '#f59e0b', width: 3 }),
        fill: new Fill({ color: 'rgba(245,158,11,0.2)' }),
      }),
    });

    profileLineLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const kind = feature.get('kind');
        if (kind === 'start') {
          return new Style({
            image: new Circle({
              radius: 5,
              fill: new Fill({ color: '#22c55e' }),
              stroke: new Stroke({ color: '#14532d', width: 2 }),
            }),
          });
        }
        if (kind === 'end') {
          return new Style({
            image: new Circle({
              radius: 5,
              fill: new Fill({ color: '#ef4444' }),
              stroke: new Stroke({ color: '#7f1d1d', width: 2 }),
            }),
          });
        }
        if (kind === 'hover') {
          return new Style({
            image: new Circle({
              radius: 4,
              fill: new Fill({ color: '#f59e0b' }),
              stroke: new Stroke({ color: '#78350f', width: 2 }),
            }),
          });
        }
        return new Style({
          stroke: new Stroke({ color: '#2563eb', width: 3, lineDash: [6, 6] }),
        });
      },
    });
    profileLineLayerRef.current.setZIndex(1000);

    routingLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const kind = feature.get('kind');
        if (kind === 'route') {
          return new Style({
            stroke: new Stroke({ color: '#0ea5e9', width: 4 }),
          });
        }
        if (kind === 'start' || kind === 'end') {
          const label = kind === 'start' ? 'A' : 'B';
          const fill = kind === 'start' ? '#22c55e' : '#ef4444';
          const stroke = kind === 'start' ? '#14532d' : '#7f1d1d';
          return new Style({
            image: new Circle({
              radius: 6,
              fill: new Fill({ color: fill }),
              stroke: new Stroke({ color: stroke, width: 2 }),
            }),
            text: new Text({
              text: label,
              offsetY: -16,
              fill: new Fill({ color: '#0f172a' }),
              stroke: new Stroke({ color: '#ffffff', width: 3 }),
            }),
          });
        }
        return null;
      },
    });
    routingLayerRef.current.setZIndex(900);

    bufferLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const kind = feature.get('kind');
        if (kind === 'source') {
          return new Style({
            stroke: new Stroke({ color: '#f59e0b', width: 2.5 }),
            fill: new Fill({ color: 'rgba(245,158,11,0.15)' }),
          });
        }
        if (kind === 'result') {
          const geometryType = feature.getGeometry()?.getType?.();
          if (geometryType === 'Point' || geometryType === 'MultiPoint') {
            return new Style({
              image: new Circle({
                radius: 4,
                fill: new Fill({ color: '#2563eb' }),
                stroke: new Stroke({ color: '#1e3a8a', width: 1.5 }),
              }),
            });
          }
          if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
            return new Style({
              stroke: new Stroke({ color: '#2563eb', width: 3 }),
            });
          }
          return new Style({
            stroke: new Stroke({ color: '#2563eb', width: 2 }),
            fill: new Fill({ color: 'rgba(37,99,235,0.2)' }),
          });
        }
        return new Style({
          stroke: new Stroke({ color: '#0f766e', width: 2 }),
          fill: new Fill({ color: 'rgba(20,184,166,0.2)' }),
        });
      },
    });
    bufferLayerRef.current.setZIndex(880);

    spatialQueryLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: (feature) => {
        const kind = feature.get('kind');
        const geometryType = feature.getGeometry()?.getType?.();
        if (geometryType === 'Point' || geometryType === 'MultiPoint') {
          const pointColor =
            kind === 'reference' ? '#16a34a' : kind === 'target' ? '#64748b' : '#7c3aed';
          const pointStroke =
            kind === 'reference' ? '#14532d' : kind === 'target' ? '#334155' : '#4c1d95';
          const radius = kind === 'result' ? 6 : 4;
          return new Style({
            image: new Circle({
              radius,
              fill: new Fill({ color: pointColor }),
              stroke: new Stroke({ color: pointStroke, width: 1.5 }),
            }),
          });
        }
        if (geometryType === 'LineString' || geometryType === 'MultiLineString') {
          const lineColor =
            kind === 'reference' ? '#16a34a' : kind === 'target' ? '#64748b' : '#7c3aed';
          const lineWidth = kind === 'result' ? 4 : 2.5;
          return new Style({
            stroke: new Stroke({ color: lineColor, width: lineWidth }),
          });
        }
        const strokeColor =
          kind === 'reference' ? '#16a34a' : kind === 'target' ? '#64748b' : '#7c3aed';
        const fillColor =
          kind === 'reference'
            ? 'rgba(22,163,74,0.16)'
            : kind === 'target'
              ? 'rgba(100,116,139,0.14)'
              : 'rgba(124,58,237,0.24)';
        return new Style({
          stroke: new Stroke({ color: strokeColor, width: kind === 'result' ? 3 : 2 }),
          fill: new Fill({ color: fillColor }),
        });
      },
    });
    spatialQueryLayerRef.current.setZIndex(878);

    osmAoiLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({ color: '#f59e0b', width: 2 }),
        fill: new Fill({ color: 'rgba(245,158,11,0.12)' }),
      }),
    });
    osmAoiLayerRef.current.setZIndex(877);

    heatmapLayerRef.current = new HeatmapLayer({
      source: new VectorSource(),
      visible: false,
      blur: 24,
      radius: 16,
      weight: (feature) => Number(feature.get('_weight') || 0.5),
    });
    heatmapLayerRef.current.setZIndex(875);

    aoiLayerRef.current = new VectorLayer({
      source: new VectorSource(),
      style: new Style({
        stroke: new Stroke({ color: '#7c3aed', width: 2 }),
        fill: new Fill({ color: 'rgba(124,58,237,0.15)' }),
      }),
    });
    aoiLayerRef.current.setZIndex(850);

    rasterLayerRef.current = new TileLayer({
      visible: false,
      opacity: 1,
      source: new TileWMS({
        url: 'http://192.168.20.57:7000/api/bhuvan/wms/',
        projection: 'EPSG:4326',
        params: {
          LAYERS: 'LULC250K_1819',
          TILED: true,
          TRANSPARENT: true,
          FORMAT: 'image/png',
          VERSION: '1.1.1',
          SRS: 'EPSG:4326',
        },
      }),
    });

    rasterCompareLayerRef.current = new TileLayer({
      visible: false,
      opacity: 1,
      source: new TileWMS({
        url: 'http://192.168.20.57:7000/api/bhuvan/wms/',
        projection: 'EPSG:4326',
        params: {
          LAYERS: 'LULC250K_2425',
          TILED: true,
          TRANSPARENT: true,
          FORMAT: 'image/png',
          VERSION: '1.1.1',
          SRS: 'EPSG:4326',
        },
      }),
    });

    rasterImportLayerRef.current = new WebGLTileLayer({
      visible: false,
      source: null,
    });
    rasterImportCompareLayerRef.current = new WebGLTileLayer({
      visible: false,
      source: null,
    });

    rasterLayerRef.current.getSource().setTileLoadFunction(
      rasterTileLoadFunction(rasterLayerRef.current.getSource())
    );
    rasterCompareLayerRef.current.getSource().setTileLoadFunction(
      rasterTileLoadFunction(rasterCompareLayerRef.current.getSource())
    );

    const addSplitClip = (layer, isLeft) => {
      layer.on('prerender', (event) => {
        const ctx = event.context;
        if (!ctx) return;

        const size = mapRef.current?.getSize();
        const width = size ? size[0] : ctx.canvas?.width;
        const height = size ? size[1] : ctx.canvas?.height;
        const compareOn = rasterCompareEnabledRef.current;

        if (!compareOn && !isLeft) {
          return;
        }

        if (typeof ctx.save === 'function') {
          const split = compareOn ? Math.max(0, Math.min(1, rasterSplitRef.current)) * width : width;
          ctx.save();
          ctx.beginPath();
          if (isLeft) {
            ctx.rect(0, 0, split, height);
          } else {
            ctx.rect(split, 0, width - split, height);
          }
          ctx.clip();
          return;
        }

        // WebGL context (GeoTIFF uses WebGLTileLayer)
        if (typeof ctx.enable === 'function' && typeof ctx.scissor === 'function') {
          const gl = ctx;
          const drawingWidth = gl.drawingBufferWidth || width;
          const drawingHeight = gl.drawingBufferHeight || height;
          const split = compareOn ? Math.max(0, Math.min(1, rasterSplitRef.current)) * drawingWidth : drawingWidth;
          const prevEnabled = gl.isEnabled(gl.SCISSOR_TEST);
          const prevBox = gl.getParameter(gl.SCISSOR_BOX);
          layer.set('_scissorState', { prevEnabled, prevBox });
          gl.enable(gl.SCISSOR_TEST);
          if (isLeft) {
            gl.scissor(0, 0, Math.max(0, Math.floor(split)), drawingHeight);
          } else {
            gl.scissor(Math.max(0, Math.floor(split)), 0, Math.max(0, Math.floor(drawingWidth - split)), drawingHeight);
          }
        }
      });

      layer.on('postrender', (event) => {
        const ctx = event.context;
        if (!ctx) return;
        const compareOn = rasterCompareEnabledRef.current;
        if (!compareOn && !isLeft) {
          return;
        }

        if (typeof ctx.restore === 'function') {
          ctx.restore();
          return;
        }

        if (typeof ctx.disable === 'function') {
          const gl = ctx;
          const state = layer.get('_scissorState');
          if (state) {
            if (state.prevEnabled) {
              gl.enable(gl.SCISSOR_TEST);
              gl.scissor(state.prevBox[0], state.prevBox[1], state.prevBox[2], state.prevBox[3]);
            } else {
              gl.disable(gl.SCISSOR_TEST);
            }
            layer.unset('_scissorState');
          } else {
            gl.disable(gl.SCISSOR_TEST);
          }
        }
      });
    };

    addSplitClip(rasterLayerRef.current, true);
    addSplitClip(rasterCompareLayerRef.current, false);
    addSplitClip(rasterImportLayerRef.current, true);
    addSplitClip(rasterImportCompareLayerRef.current, false);

    INITIAL_LAYERS.forEach((cfg) => {
      layersRef.current[cfg.id] = new TileLayer({
        visible: cfg.visible,
        opacity: cfg.style?.opacity ?? 1,
        source: new TileWMS({
          url: `${GEOSERVER_PROXY_BASE}/wms`,
          params: {
            LAYERS: cfg.layerName,
            TILED: true,
            SLD_BODY: styleConfigToSldBody(cfg.layerName, cfg.style, cfg.geometryType),
          },
        }),
      });
    });

    popupOverlayRef.current = new Overlay({
      element: popupRef.current,
      autoPan: true,
      offset: [0, -12],
    });

    baseLayerRef.current = new TileLayer({ source: createBasemapSource('osm') });

    mapRef.current = new Map({
      target: 'map',
      layers: [
        baseLayerRef.current,
        ...Object.values(layersRef.current),
        highlightLayerRef.current,
        hoverHighlightLayerRef.current,
        rasterLayerRef.current,
        rasterCompareLayerRef.current,
        rasterImportLayerRef.current,
        rasterImportCompareLayerRef.current,
        routingLayerRef.current,
        bufferLayerRef.current,
        spatialQueryLayerRef.current,
        osmAoiLayerRef.current,
        heatmapLayerRef.current,
        aoiLayerRef.current,
        profileLineLayerRef.current,
      ],
      overlays: [popupOverlayRef.current],
      view: new View({
        center: fromLonLat([73.80526928539408, 18.645406301682286]),
        zoom: 11,
        minZoom: 11,
      }),
    });

    const updateRasterViewExtent = () => {
      const map = mapRef.current;
      if (!map) return;
      const view = map.getView();
      const size = map.getSize();
      if (!size) return;
      const extent3857 = view.calculateExtent(size);
      const extent4326 = transformExtent(extent3857, 'EPSG:3857', 'EPSG:4326');
      rasterViewExtentRef.current = extent4326;
      rasterLayerRef.current?.getSource().refresh();
      rasterCompareLayerRef.current?.getSource().refresh();
    };

    updateRasterViewExtent();
    mapRef.current.on('moveend', updateRasterViewExtent);

    const handleMoveStart = () => {
      // if (!rasterFreezeDuringMoveRef.current) return;
      if (activeTabRef.current !== 'raster') return;
      if (!importedRasterVisibleRef.current) return;
      rasterImportLayerRef.current?.setVisible(false);
      rasterImportCompareLayerRef.current?.setVisible(false);
    };

    const handleMoveEnd = () => {
      // if (!rasterFreezeDuringMoveRef.current) return;
      if (activeTabRef.current !== 'raster') return;
      if (!importedRasterVisibleRef.current) return;
      rasterImportLayerRef.current?.setVisible(true);
      if (
        rasterThemeRef.current === 'UPLOAD' &&
        uploadedCompareEnabledRef.current &&
        uploadedRightRef.current
      ) {
        rasterImportCompareLayerRef.current?.setVisible(true);
      }
    };

    mapRef.current.on('movestart', handleMoveStart);
    mapRef.current.on('moveend', handleMoveEnd);

    mapRef.current.on('singleclick', async (evt) => {
      const runWfsIdentifyFallback = async (activeLayer, coordinate) => {
        try {
          const resolution = mapRef.current?.getView()?.getResolution() || 1;
          // Query a tiny bbox around click (pixel-based tolerance in map units).
          const tol = Math.max(resolution * 6, 2);
          const [x, y] = coordinate;
          const bbox = [x - tol, y - tol, x + tol, y + tol].join(',');
          const params = new URLSearchParams({
            service: 'WFS',
            version: '1.1.0',
            request: 'GetFeature',
            typeName: activeLayer.layerName,
            outputFormat: 'application/json',
            srsName: 'EPSG:3857',
            bbox: `${bbox},EPSG:3857`,
            maxFeatures: '1',
          });
          const url = `${GEOSERVER_PROXY_BASE}/wfs?${params.toString()}`;
          const res = await fetch(url);
          if (!res.ok) return null;
          const json = await res.json();
          if (!json?.features?.length) return null;
          return json;
        } catch (e) {
          console.error('WFS identify fallback failed:', e);
          return null;
        }
      };

      if (profileModeRef.current && rasterThemeRef.current === 'UPLOAD') {
        const nextPoints = [...profilePointsRef.current];
        if (nextPoints.length >= 2) {
          nextPoints.splice(0, nextPoints.length);
        }
        nextPoints.push(evt.coordinate);
        setProfilePoints(nextPoints);
        if (nextPoints.length === 2) {
          setProfileMode(false);
          const lineSource = profileLineLayerRef.current?.getSource();
          if (lineSource) {
            lineSource.clear();
            const lineFeature = new Feature(new LineString(nextPoints));
            lineFeature.set('kind', 'line');
            const startFeature = new Feature(new Point(nextPoints[0]));
            startFeature.set('kind', 'start');
            const endFeature = new Feature(new Point(nextPoints[1]));
            endFeature.set('kind', 'end');
            lineSource.addFeature(lineFeature);
            lineSource.addFeature(startFeature);
            lineSource.addFeature(endFeature);
          }
          const demItem = demRastersRef.current.find((item) => item.name === profileDemRef.current);
          if (!demItem) {
            setProfileError('Select a DEM to run profile.');
            setProfileOpen(true);
          } else if (buildElevationProfileRef.current) {
            await buildElevationProfileRef.current(nextPoints[0], nextPoints[1], demItem);
          }
        }
        return;
      }

      if (aoiModeRef.current) {
        return;
      }

      if (bufferModeRef.current) {
        if (bufferInputModeRef.current === 'center_click' && runBufferWorkflowRef.current) {
          await runBufferWorkflowRef.current({ center: evt.coordinate });
          return;
        }
        return;
      }

      if (routingModeRef.current) {
        const nextPoints = [...routingPointsRef.current];
        if (nextPoints.length >= 2) {
          nextPoints.splice(0, nextPoints.length);
        }
        nextPoints.push(evt.coordinate);
        setRoutingPoints(nextPoints);
        if (nextPoints.length === 2) {
          setRoutingMode(false);
          if (buildRoutingPathRef.current) {
            await buildRoutingPathRef.current(nextPoints[0], nextPoints[1]);
          }
        }
        return;
      }

      closePopup();

      // Check for imported layer features first
      let foundImportedFeature = false;
      for (const layerInfo of importedLayersRef.current) {
        if (layerInfo.visible) {
          const features = mapRef.current.getFeaturesAtPixel(evt.pixel, {
            layerFilter: (layer) => layer === layerInfo.layer,
          });

          if (features && features.length > 0) {
            const feature = features[0];
            const geometry = feature.getGeometry();

            // Get coordinates in EPSG:4326
            let coords4326 = null;
            if (geometry) {
              // For point geometries, convert to 4326
              if (geometry.getType() === 'Point') {
                coords4326 = geometry.clone().transform('EPSG:3857', 'EPSG:4326').getCoordinates();
              }
            }

            const properties = feature.getProperties();
            const featureInfo = {
              ...properties,
              geometry: geometry ? geometry.getType() : 'Unknown',
              coordinates_4326: coords4326 ? `${coords4326[0].toFixed(6)}, ${coords4326[1].toFixed(6)}` : 'N/A',
            };

            setFeatureInfo(featureInfo);
            popupOverlayRef.current.setPosition(evt.coordinate);
            foundImportedFeature = true;
            break;
          }
        }
      }

      if (foundImportedFeature) return;

      const active = layersConfigRef.current.find((l) => l.visible);
      if (!active) return;

      let url = layersRef.current[active.id]
        .getSource()
        .getFeatureInfoUrl(
          evt.coordinate,
          mapRef.current.getView().getResolution(),
          'EPSG:3857',
          { INFO_FORMAT: 'application/json' }
        );

      if (!url) return;
      let json = null;
      try {
        const res = await fetch(url);
        json = await res.json();
      } catch (e) {
        console.error('GetFeatureInfo fetch failed:', e);
        return;
      }

      if (!json?.features?.length) {
        json = await runWfsIdentifyFallback(active, evt.coordinate);
      }

      if (json?.features?.length) {
        const features = new GeoJSON().readFeatures(json, {
          dataProjection: 'EPSG:3857',
          featureProjection: 'EPSG:3857',
        });
        highlightLayerRef.current.getSource().clear();
        highlightLayerRef.current.getSource().addFeatures(features);
        setFeatureInfo(features[0].getProperties());
        popupOverlayRef.current.setPosition(evt.coordinate);
      }
    });

    const initialActive = INITIAL_LAYERS.find((l) => l.visible);
    if (initialActive) {
      fetchAttributes(initialActive.apiLayer, null, initialActive.title);
    }
    return () => {
      mapRef.current?.un('movestart', handleMoveStart);
      mapRef.current?.un('moveend', handleMoveEnd);
      if (rasterImportUrlRef.current) {
        URL.revokeObjectURL(rasterImportUrlRef.current);
        rasterImportUrlRef.current = null;
      }
      mapRef.current.setTarget(null);
    };
  }, [closePopup, fetchAttributes, rasterTileLoadFunction]);

  useEffect(() => {
    if (!basemapPickerOpen) return undefined;
    const onMouseDown = (event) => {
      if (!basemapPickerRef.current?.contains(event.target)) {
        setBasemapPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [basemapPickerOpen]);

  useEffect(() => {
    if (!chatAssistantOpen) return undefined;
    const onMouseDown = (event) => {
      if (!chatAssistantRef.current?.contains(event.target)) {
        setChatAssistantOpen(false);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [chatAssistantOpen]);

  useEffect(() => {
    if (activeTab === '3D') return undefined;
    const frameId = window.requestAnimationFrame(() => {
      mapRef.current?.updateSize();
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab]);

  /* =========================
     Actions
  ========================= */
  const applyChatRoadTypeFilter = useCallback((roadType) => {
    const normalizedType = String(roadType || '').trim();
    if (!normalizedType) return false;

    const roadsConfig = layersConfigRef.current.find((layer) => layer.id === 'roads');
    if (!roadsConfig) return false;

    const escaped = normalizedType.replace(/'/g, "''");
    const cql = `type = '${escaped}'`;

    setLayersConfig((prev) => prev.map((layer) => ({ ...layer, visible: layer.id === 'roads' })));

    Object.entries(layersRef.current).forEach(([id, layer]) => {
      if (!layer) return;
      if (id === 'roads') {
        layer.setVisible(true);
        layer.getSource?.()?.updateParams?.({ CQL_FILTER: cql });
      } else {
        layer.setVisible(false);
        layer.getSource?.()?.updateParams?.({ CQL_FILTER: 'INCLUDE' });
      }
    });

    setQuery({ field: 'type', operator: '=', value: normalizedType });
    chatFilterContextRef.current = {
      apiLayer: roadsConfig.apiLayer,
      layerId: roadsConfig.id,
      clauses: [{ field: 'type', operator: '=', value: normalizedType }],
    };
    fetchAttributes(roadsConfig.apiLayer, cql, roadsConfig.title);
    setActiveTab('attributes');
    closePopup();
    return true;
  }, [closePopup, fetchAttributes]);

  const buildChatClause = useCallback((field, operator, value) => {
    const normalizedField = String(field || '').trim();
    const normalizedOperator = String(operator || '=').trim() || '=';
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedField || !normalizedValue) {
      return null;
    }

    const numericValue = Number(normalizedValue);
    const isNumeric = normalizedValue !== '' && !Number.isNaN(numericValue);
    const escapedValue = normalizedValue.replace(/'/g, "''");

    return {
      field: normalizedField,
      operator: normalizedOperator,
      value: normalizedValue,
      cql: `${normalizedField} ${normalizedOperator} ${isNumeric ? normalizedValue : `'${escapedValue}'`}`,
    };
  }, []);

  const applyChatFilterClauses = useCallback((apiLayer, clauses) => {
    const normalizedLayer = String(apiLayer || '').trim().toLowerCase();
    const validClauses = Array.isArray(clauses)
      ? clauses
        .map((clause) => buildChatClause(clause.field, clause.operator, clause.value))
        .filter(Boolean)
      : [];
    if (!normalizedLayer || !validClauses.length) return false;

    const layerCfg = layersConfigRef.current.find(
      (layer) => String(layer.apiLayer || '').toLowerCase() === normalizedLayer
    );
    if (!layerCfg) return false;

    const cql = validClauses.map((clause) => clause.cql).join(' AND ');

    setLayersConfig((prev) => prev.map((layer) => ({ ...layer, visible: layer.id === layerCfg.id })));

    Object.entries(layersRef.current).forEach(([id, layer]) => {
      if (!layer) return;
      if (id === layerCfg.id) {
        layer.setVisible(true);
        layer.getSource?.()?.updateParams?.({ CQL_FILTER: cql });
      } else {
        layer.setVisible(false);
        layer.getSource?.()?.updateParams?.({ CQL_FILTER: 'INCLUDE' });
      }
    });

    const lastClause = validClauses[validClauses.length - 1];
    setQuery({ field: lastClause.field, operator: lastClause.operator, value: lastClause.value });
    chatFilterContextRef.current = {
      apiLayer: layerCfg.apiLayer,
      layerId: layerCfg.id,
      clauses: validClauses.map(({ field, operator, value }) => ({ field, operator, value })),
    };
    fetchAttributes(layerCfg.apiLayer, cql, layerCfg.title);
    setActiveTab('attributes');
    closePopup();
    return true;
  }, [buildChatClause, closePopup, fetchAttributes]);

  const applyChatLayerFilter = useCallback((apiLayer, field, value) => {
    return applyChatFilterClauses(apiLayer, [{ field, operator: '=', value }]);
  }, [applyChatFilterClauses]);

  const applyChatShowLayer = useCallback((apiLayer) => {
    const normalizedLayer = String(apiLayer || '').trim().toLowerCase();
    if (!normalizedLayer) return false;

    const layerCfg = layersConfigRef.current.find(
      (layer) => String(layer.apiLayer || '').toLowerCase() === normalizedLayer
    );
    if (!layerCfg) return false;

    setLayersConfig((prev) => prev.map((layer) => ({ ...layer, visible: layer.id === layerCfg.id })));

    Object.entries(layersRef.current).forEach(([id, layer]) => {
      if (!layer) return;
      const isTarget = id === layerCfg.id;
      layer.setVisible(isTarget);
      layer.getSource?.()?.updateParams?.({ CQL_FILTER: 'INCLUDE' });
    });

    setQuery({ field: '', operator: '=', value: '' });
    chatFilterContextRef.current = {
      apiLayer: layerCfg.apiLayer,
      layerId: layerCfg.id,
      clauses: [],
    };
    fetchAttributes(layerCfg.apiLayer, null, layerCfg.title);
    setActiveTab('attributes');
    closePopup();
    return true;
  }, [closePopup, fetchAttributes]);

  const normalizeLayerIdFromChat = useCallback((rawValue) => {
    const value = String(rawValue || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!value) return '';
    const aliasMap = {
      roads: 'roads',
      road: 'roads',
      landmark: 'Landmarks',
      landmarks: 'Landmarks',
      poi: 'Landmarks',
      pois: 'Landmarks',
      landuse: 'Land Use',
      'land use': 'Land Use',
      kanduse: 'Land Use',
      lulc: 'Land Use',
      water: 'Water Body',
      waterbody: 'Water Body',
      'water body': 'Water Body',
      canal: 'Water Body',
      canals: 'Water Body',
      river: 'Water Body',
      rivers: 'Water Body',
    };
    return aliasMap[value] || '';
  }, []);

  const normalizeRoadTypeFromChat = useCallback((rawValue) => {
    const value = String(rawValue || '').trim().toLowerCase();
    if (!value) return '';

    const compact = value.replace(/\s+/g, ' ');
    const aliases = {
      highway: 'Highway',
      highways: 'Highway',
      arterial: 'Arterial',
      arterials: 'Arterial',
      'arterial road': 'Arterial',
      'arterial roads': 'Arterial',
      local: 'Local',
      locals: 'Local',
      'local road': 'Local',
      'local roads': 'Local',
      service: 'Service',
      'service road': 'Service',
      'service roads': 'Service',
      residential: 'Residential',
      'residential road': 'Residential',
      'residential roads': 'Residential',
      major: 'Major',
      'major road': 'Major',
      'major roads': 'Major',
      minor: 'Minor',
      'minor road': 'Minor',
      'minor roads': 'Minor',
    };
    if (aliases[compact]) return aliases[compact];
    return compact
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, []);

  const isKnownRoadTypePhrase = useCallback((rawValue) => {
    const value = String(rawValue || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!value) return false;
    const known = new Set([
      'highway',
      'highways',
      'arterial',
      'arterials',
      'arterial road',
      'arterial roads',
      'local',
      'locals',
      'local road',
      'local roads',
      'service',
      'service road',
      'service roads',
      'residential',
      'residential road',
      'residential roads',
      'major',
      'major road',
      'major roads',
      'minor',
      'minor road',
      'minor roads',
    ]);
    return known.has(value);
  }, []);

  const parseChatFollowupFilter = useCallback((text) => {
    const message = String(text || '').trim();
    if (!message) return null;

    const patterns = [
      /^(?:also\s+)?(?:whose|where|with|and)\s+([a-z0-9_]+)\s*(=|is|equals|equal to|>=|<=|>|<)\s+(.+?)$/i,
      /^(?:also\s+)?([a-z0-9_]+)\s*(=|is|equals|equal to|>=|<=|>|<)\s+(.+?)$/i,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (!match) continue;

      const field = String(match[1] || '').trim();
      let operator = String(match[2] || '=').trim().toLowerCase();
      const value = String(match[3] || '').trim().replace(/[.?!,;:]+$/, '');

      if (!field || !value) continue;
      if (operator === 'is' || operator === 'equals' || operator === 'equal to') {
        operator = '=';
      }

      return { field, operator, value };
    }

    return null;
  }, []);

  const parseChatMapCommand = useCallback((text) => {
    const message = String(text || '').trim();
    if (!message) return null;
    const normalizedMessage = message.toLowerCase().replace(/\s+/g, ' ');

    const bufferMatch = normalizedMessage.match(
      /buffer(?:\s+around|\s+of|\s+with)?\s*(\d+(?:\.\d+)?)\s*(m|meter|meters|km|kilometer|kilometers)\s+(?:from|for|around)\s+([a-z0-9_ ]+)/i
    );
    if (bufferMatch) {
      const rawDistance = Number(bufferMatch[1]);
      const unit = String(bufferMatch[2] || '').toLowerCase();
      const rawLayer = String(bufferMatch[3] || '').trim();
      const layerAlias = normalizeLayerIdFromChat(rawLayer);
      const normalizedApiLayer = String(layerAlias || '').toLowerCase().replace(/\s+/g, '');
      const apiLayerMap = {
        roads: 'roads',
        waterbody: 'waterbody',
        landuse: 'landuse',
        landmarks: 'landmarks',
      };
      const apiLayer = apiLayerMap[normalizedApiLayer];
      if (apiLayer && Number.isFinite(rawDistance) && rawDistance > 0) {
        const distanceMeters = unit.startsWith('k') ? rawDistance * 1000 : rawDistance;
        return {
          kind: 'buffer_setup',
          apiLayer,
          distanceMeters: Math.max(1, Math.round(distanceMeters)),
        };
      }
    }

    const nearMatch = message.match(
      /how\s+many\s+([a-z_ ]+?)\s+(?:are\s+)?(?:near|within|inside)\s+(?:to\s+)?(\d+(?:\.\d+)?)\s*(m|meter|meters|km|kilometer|kilometers)\s+(?:of|from)\s+([a-z_ ]+)/i
    );
    if (nearMatch) {
      const targetLayer = normalizeLayerIdFromChat(nearMatch[1]);
      const rawDistance = Number(nearMatch[2]);
      const unit = String(nearMatch[3] || '').toLowerCase();
      const referenceLayer = normalizeLayerIdFromChat(nearMatch[4]);
      if (targetLayer && referenceLayer && Number.isFinite(rawDistance) && rawDistance > 0) {
        const distanceMeters = unit.startsWith('k') ? rawDistance * 1000 : rawDistance;
        return {
          kind: 'spatial_near_count',
          targetLayer,
          referenceLayer,
          distanceMeters,
        };
      }
    }

    const roadsTypePatterns = [
      /^show(?:\s+me)?\s+(?:only\s+)?([a-z0-9_ -]+?)\s+roads?\s+only(?:\s+on\s+map)?$/i,
      /^show(?:\s+me)?\s+(?:only\s+)?([a-z0-9_ -]+?)(?:\s+roads?)?(?:\s+on\s+map)?$/i,
      /^in\s+roads?\s+show(?:\s+me)?\s+type\s+([a-z0-9_ -]+?)(?:\s+road)?$/i,
      /^show(?:\s+me)?\s+type\s+([a-z0-9_ -]+?)\s+roads?$/i,
    ];
    for (const pattern of roadsTypePatterns) {
      const match = message.match(pattern);
      if (!match) continue;
      const candidateType = String(match[1] || '').trim();
      if (!isKnownRoadTypePhrase(candidateType)) continue;
      const normalizedRoadType = normalizeRoadTypeFromChat(candidateType);
      if (!normalizedRoadType) continue;
      return {
        kind: 'roads_type_filter',
        value: normalizedRoadType,
      };
    }

    const singleRoadTypeMatch = message.match(
      /^(highway|highways|arterial|arterials|local|locals|service|residential)$/i
    );
    if (singleRoadTypeMatch) {
      return {
        kind: 'roads_type_filter',
        value: normalizeRoadTypeFromChat(singleRoadTypeMatch[1]),
      };
    }

    const followupFilter = parseChatFollowupFilter(message);
    if (followupFilter && chatFilterContextRef.current?.apiLayer) {
      return {
        kind: 'followup_filter',
        apiLayer: chatFilterContextRef.current.apiLayer,
        clause: followupFilter,
      };
    }

    return null;
  }, [normalizeLayerIdFromChat, normalizeRoadTypeFromChat, isKnownRoadTypePhrase, parseChatFollowupFilter]);

  const sendChatMessage = useCallback(async (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed) return;
    if (chatLoading) return;

    const messagesForApi = [...chatMessages, { role: 'user', text: trimmed }];
    setChatMessages(messagesForApi);
    setChatInput('');

    const command = parseChatMapCommand(trimmed);
    if (command?.kind === 'roads_type_filter') {
      const applied = applyChatRoadTypeFilter(command.value);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: applied
            ? `Applied filter on Roads: type = '${command.value}'. Showing matching geometry and attributes.`
            : 'Could not apply this filter command on the map.',
        },
      ]);
      return;
    }

    if (command?.kind === 'followup_filter') {
      const existingClauses = Array.isArray(chatFilterContextRef.current?.clauses)
        ? chatFilterContextRef.current.clauses
        : [];
      const mergedClauses = [...existingClauses, command.clause];
      const applied = applyChatFilterClauses(command.apiLayer, mergedClauses);
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: applied
            ? `Added filter on ${command.apiLayer}: ${command.clause.field} ${command.clause.operator} ${command.clause.value}.`
            : 'Could not apply this follow-up filter on the current map selection.',
        },
      ]);
      return;
    }

    if (command?.kind === 'spatial_near_count') {
      const result = await executeSpatialQuery({
        referenceLayer: command.referenceLayer,
        targetLayer: command.targetLayer,
        operator: 'within',
        distance: command.distanceMeters,
        limit: 2500,
      });
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: result?.ok
            ? `Found ${result.count} ${String(command.targetLayer).toLowerCase()} within ${Math.round(command.distanceMeters)} meters of ${String(command.referenceLayer).toLowerCase()}. I applied the result on map and attributes.`
            : `Could not run spatial query: ${result?.error || 'Unknown error.'}`,
        },
      ]);
      return;
    }

    if (command?.kind === 'buffer_setup') {
      const layerCfg = layersConfigRef.current.find(
        (layer) => String(layer.apiLayer || '').toLowerCase() === String(command.apiLayer).toLowerCase()
      );
      if (!layerCfg) {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', text: 'Could not find that layer for buffer.' },
        ]);
        return;
      }
      setActiveTab('analysis');
      setAnalysisTool('buffer');
      setBufferInputMode('center_click');
      setBufferDistance(Math.max(1, Number(command.distanceMeters) || 1));
      clearBufferSelectionFilter();
      setBufferTargetLayer(layerCfg.id);
      setBufferError('');
      setBufferMode(false);
      setBufferResultCount(0);
      bufferLayerRef.current?.getSource?.()?.clear?.();
      focusSelectedBufferLayer(layerCfg.id);
      setBufferMode(true);
      setRoutingMode(false);
      setProfileMode(false);
      setLulcAoiMode(false);
      if (mapRef.current && aoiDrawRef.current) {
        mapRef.current.removeInteraction(aoiDrawRef.current);
        aoiDrawRef.current = null;
      }
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Buffer is ready: ${Math.max(1, Number(command.distanceMeters) || 1)}m from ${layerCfg.title.replace(/^[^\w]+/, '').trim()}. Click on map to create it.`,
        },
      ]);
      return;
    }

    setChatLoading(true);

    try {
      const json = await postJson(CHAT_API_URL, {
        question: trimmed,
        messages: messagesForApi,
        max_tokens: 320,
      });
      if (json?.action?.type === 'apply_filter') {
        applyChatLayerFilter(json.action.layer, json.action.field, json.action.value);
      } else if (json?.action?.type === 'show_layer') {
        applyChatShowLayer(json.action.layer);
      } else if (json?.action?.type === 'show_layer_with_filter') {
        applyChatShowLayer(json.action.layer);
        if (json.action.filter && json.action.filter.field && json.action.filter.value) {
          applyChatLayerFilter(json.action.layer, json.action.filter.field, json.action.filter.value);
        }
      }
      const answer = typeof json?.answer === 'string' ? json.answer.trim() : '';
      const upstreamError = typeof json?.upstream_error === 'string' ? json.upstream_error.trim() : '';
      const upstreamDetails = typeof json?.details === 'string' ? json.details.trim() : '';
      const composedAnswer = json?.model === 'fallback' && (upstreamError || upstreamDetails)
        ? [answer, upstreamError, upstreamDetails].filter(Boolean).join('\n')
        : answer;
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: composedAnswer || 'I could not generate a response right now.',
        },
      ]);
    } catch (error) {
      setChatMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: `Error: ${error.message || 'Unable to reach chat service.'}`,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  }, [
    chatLoading,
    chatMessages,
    CHAT_API_URL,
    parseChatMapCommand,
    applyChatRoadTypeFilter,
    applyChatFilterClauses,
    applyChatLayerFilter,
    applyChatShowLayer,
    executeSpatialQuery,
    clearBufferSelectionFilter,
    focusSelectedBufferLayer,
  ]);

  useEffect(() => {
    const startLayer = LULC_YEARS.find((y) => y.year === rasterStartYear)?.layer;
    if (startLayer) updateRasterLayer(startLayer);

    const endLayer = LULC_YEARS.find((y) => y.year === rasterEndYear)?.layer;
    if (endLayer) updateRasterCompareLayer(endLayer);

    if (mapRef.current) {
      mapRef.current.render();
    }
  }, [
    rasterEnabled,
    rasterCompareEnabled,
    rasterStartYear,
    rasterEndYear,
    updateRasterLayer,
    updateRasterCompareLayer,
  ]);

  useEffect(() => {
    const compareSwipeActive =
      rasterTheme === 'LULC'
        ? rasterEnabled && rasterCompareEnabled && rasterMode === 'swipe'
        : importedRasterVisible && uploadedCompareEnabled;
    if (!compareSwipeActive) return;

    const mapEl = mapRef.current?.getTargetElement();
    if (!mapEl) return;

    const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

    const updateFromClientX = (clientX) => {
      const rect = mapEl.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      setRasterSplit(ratio);
    };

    const onMouseMove = (event) => {
      if (!rasterDraggingRef.current) return;
      updateFromClientX(event.clientX);
    };

    const onMouseUp = () => {
      rasterDraggingRef.current = false;
    };

    const onTouchMove = (event) => {
      if (!rasterDraggingRef.current) return;
      const touch = event.touches[0];
      if (!touch) return;
      updateFromClientX(touch.clientX);
    };

    const onTouchEnd = () => {
      rasterDraggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('touchmove', onTouchMove);
    window.addEventListener('touchend', onTouchEnd);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [rasterEnabled, rasterCompareEnabled, rasterMode, rasterTheme, importedRasterVisible, uploadedCompareEnabled]);

  useEffect(() => {
    if (!mapRef.current) return;

    const hideNonRasterLayers = () => {
      nonRasterVisibilityRef.current.base = baseLayerRef.current?.getVisible() ?? true;
      // Keep basemap visible in raster tab
      baseLayerRef.current?.setVisible(true);

      Object.entries(layersRef.current).forEach(([id, layer]) => {
        nonRasterVisibilityRef.current.geoserver[id] = layer.getVisible();
        layer.setVisible(false);
      });

      importedLayersRef.current.forEach((layerInfo) => {
        nonRasterVisibilityRef.current.imported[layerInfo.id] = layerInfo.visible;
        layerInfo.layer.setVisible(false);
      });

      highlightLayerRef.current?.setVisible(false);
      hoverHighlightLayerRef.current?.setVisible(false);
    };

    const restoreNonRasterLayers = () => {
      baseLayerRef.current?.setVisible(nonRasterVisibilityRef.current.base ?? true);

      Object.entries(layersRef.current).forEach(([id, layer]) => {
        const config = layersConfigRef.current.find((l) => l.id === id);
        layer.setVisible(config ? config.visible : false);
      });

      importedLayersRef.current.forEach((layerInfo) => {
        layerInfo.layer.setVisible(layerInfo.visible);
      });

      highlightLayerRef.current?.setVisible(true);
      hoverHighlightLayerRef.current?.setVisible(true);
    };

    const prevTab = lastTabRef.current;
    lastTabRef.current = activeTab;

    if (activeTab === 'raster' && prevTab !== 'raster') {
      hideNonRasterLayers();
      return;
    }

    if (activeTab !== 'raster' && prevTab === 'raster') {
      restoreNonRasterLayers();
    }
  }, [activeTab]);

  useEffect(() => {
    if (rasterTheme !== 'LULC') {
      setLulcStatsOpen(false);
      setLulcAoiMode(false);
      aoiLayerRef.current?.getSource().clear();
      if (mapRef.current && aoiDrawRef.current) {
        mapRef.current.removeInteraction(aoiDrawRef.current);
        aoiDrawRef.current = null;
      }
    }
  }, [rasterTheme]);

  useEffect(() => {
    const onMouseMove = (event) => {
      if (!popupDraggingRef.current || !mapRef.current || !popupOverlayRef.current) return;
      const map = mapRef.current;
      const offset = popupDragOffsetRef.current;
      const pixel = [event.clientX - offset[0], event.clientY - offset[1]];
      const coord = map.getCoordinateFromPixel(pixel);
      popupOverlayRef.current.setPosition(coord);
    };

    const onMouseUp = () => {
      popupDraggingRef.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  useEffect(() => {
    const showUploadLayers = activeTab === 'raster' && rasterTheme === 'UPLOAD' && importedRasterVisible;

    const leftLayer = rasterImportLayerRef.current;
    if (leftLayer) {
      leftLayer.setVisible(showUploadLayers);
    }

    const compareLayer = rasterImportCompareLayerRef.current;
    if (compareLayer) {
      compareLayer.setVisible(showUploadLayers && uploadedCompareEnabled && Boolean(uploadedRight));
    }
  }, [activeTab, rasterTheme, importedRasterVisible, uploadedCompareEnabled, uploadedRight]);

  useEffect(() => {
    if (!uploadedLeft || !rasterImportLayerRef.current) return;
    const item = uploadedRasters.find((r) => r.name === uploadedLeft);
    if (!item?.url) return;
    const source = createGeoTiffSource(item.url, true);
    rasterImportLayerRef.current.setSource(source);
    applyRasterStyle(rasterImportLayerRef.current);
    setImportedRasterVisible(true);
  }, [uploadedLeft, uploadedRasters, applyRasterStyle, createGeoTiffSource]);

  useEffect(() => {
    if (!uploadedCompareEnabled || !uploadedRight || !rasterImportCompareLayerRef.current) return;
    const item = uploadedRasters.find((r) => r.name === uploadedRight);
    if (!item?.url) return;
    const source = createGeoTiffSource(item.url, false);
    rasterImportCompareLayerRef.current.setSource(source);
    applyRasterStyle(rasterImportCompareLayerRef.current);
  }, [uploadedCompareEnabled, uploadedRight, uploadedRasters, applyRasterStyle, createGeoTiffSource]);

  useEffect(() => {
    if (!mapRef.current) return;
    if (activeTab !== 'raster') return;

    let needsUpdate = false;

    if (layersConfig.some((l) => l.visible)) {
      needsUpdate = true;
      Object.values(layersRef.current).forEach((layer) => layer.setVisible(false));
      setLayersConfig((prev) => prev.map((l) => (l.visible ? { ...l, visible: false } : l)));
      setAttributeData(null);
      setActiveAttributeLayer(null);
      setAttributeMeta(null);
    }

    if (importedLayers.some((l) => l.visible)) {
      needsUpdate = true;
      importedLayersRef.current.forEach((layerInfo) => {
        layerInfo.layer.setVisible(false);
      });
      setImportedLayers((prev) => prev.map((l) => (l.visible ? { ...l, visible: false } : l)));
    }

    if (needsUpdate) {
      highlightLayerRef.current?.setVisible(false);
      hoverHighlightLayerRef.current?.setVisible(false);
    }
  }, [activeTab, layersConfig, importedLayers]);

  useEffect(() => {
    const source = profileLineLayerRef.current?.getSource();
    if (!source || profilePoints.length !== 2) return;
    const hoverFeature = source
      .getFeatures()
      .find((f) => f.get('kind') === 'hover');

    if (!profileHover) {
      if (hoverFeature) {
        source.removeFeature(hoverFeature);
      }
      return;
    }

    const [start, end] = profilePoints;
    const t =
      profileData.length > 1
        ? profileHover.index / (profileData.length - 1)
        : 0;
    const coord = [
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
    ];

    if (hoverFeature) {
      hoverFeature.setGeometry(new Point(coord));
    } else {
      const feature = new Feature(new Point(coord));
      feature.set('kind', 'hover');
      source.addFeature(feature);
    }
  }, [profileHover, profilePoints, profileData]);

  const lulcPieData = (() => {
    if (!lulcStatsData) return [];
    const rows = Array.isArray(lulcStatsData) ? lulcStatsData : [lulcStatsData];
    const lulcLabels = {
      l01: 'Built-up',
      l02: 'Agricultural Land',
      l04: 'Forest',
      l06: 'Wasteland',
      l16: 'Water Bodies',
      l18: 'Wetlands',
      l22: 'Fallow Land',
      l23: 'Scrub Land',
    };
    const totals = {};
    rows.forEach((row) => {
      Object.entries(row).forEach(([key, value]) => {
        if (key.toLowerCase() === 'state') return;
        const cleanKey = key.replace(/'/g, '').trim();
        const num = Number(value);
        if (!Number.isFinite(num)) return;
        totals[cleanKey] = (totals[cleanKey] || 0) + num;
      });
    });
    return Object.entries(totals)
      .map(([code, value]) => ({ code, label: lulcLabels[code] || code, value }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value);
  })();

  const lulcPieChart = (() => {
    if (!lulcPieData.length) return null;
    const width = 260;
    const height = 260;
    const radius = 90;
    const centerX = width / 2;
    const centerY = height / 2;
    const total = lulcPieData.reduce((sum, item) => sum + item.value, 0) || 1;
    const colors = [
      '#2563eb', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6',
      '#14b8a6', '#f97316', '#22c55e', '#a855f7', '#eab308',
      '#0ea5e9', '#db2777', '#4b5563', '#84cc16', '#f43f5e'
    ];

    let startAngle = -Math.PI / 2;
    const slices = lulcPieData.map((item, index) => {
      const fraction = item.value / total;
      const endAngle = startAngle + fraction * Math.PI * 2;
      const x1 = centerX + radius * Math.cos(startAngle);
      const y1 = centerY + radius * Math.sin(startAngle);
      const x2 = centerX + radius * Math.cos(endAngle);
      const y2 = centerY + radius * Math.sin(endAngle);
      const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
      const path = [
        `M ${centerX} ${centerY}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
        'Z',
      ].join(' ');
      const color = colors[index % colors.length];
      startAngle = endAngle;
      return { path, color, label: item.label, code: item.code, value: item.value };
    });

    return (
      <div className="lulc-pie">
        <svg viewBox={`0 0 ${width} ${height}`}>
          {slices.map((slice) => (
            <path key={slice.label} d={slice.path} fill={slice.color} />
          ))}
        </svg>
        <div className="lulc-legend">
          {slices.map((slice) => (
            <div key={slice.label} className="lulc-legend-item">
              <span className="lulc-legend-swatch" style={{ background: slice.color }} />
              <span className="lulc-legend-label">
                {slice.label} ({slice.code}) — {slice.value.toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  })();

  const bufferTargetOptions = [
    ...layersConfig.map((layer) => ({
      value: layer.id,
      label: `${layer.title.replace(/^[^\w]+/, '').trim()} (GeoServer)`,
    })),
    ...importedLayers.map((layer) => ({
      value: `imported:${layer.id}`,
      label: `${layer.title} (Imported)`,
    })),
  ];
  const spatialQueryLayerOptions = layersConfig.map((layer) => ({
    value: layer.apiLayer || layer.id,
    label: `${layer.title.replace(/^[^\w]+/, '').trim()} (GeoServer)`,
  }));

  // =========================
  return (
    <div className="gis-container">
      <div className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          GIS PANEL
          <button onClick={() => setSidebarOpen(false)}>«</button>
        </div>

        <Tabs
          activeKey={activeTab}
          onSelect={handleTabSelect}
        >
          <Tab eventKey="layers" title="Layers">
            <LayersTab
              layersConfig={layersConfig}
              toggleLayer={layersApi.toggleLayer}
              layerStyleSelections={layerStyleSelections}
              applyNamedStyleToLayer={layersApi.applyNamedStyleToLayer}
              namedStyles={namedStyles}
              addingStyleForLayer={addingStyleForLayer}
              newStyleName={newStyleName}
              setNewStyleName={setNewStyleName}
              addNamedStyleForLayer={layersApi.addNamedStyleForLayer}
              styleEditorMode={styleEditorMode}
              newStyleDraft={newStyleDraft}
              setNewStyleDraft={setNewStyleDraft}
              getAttributeStyleDraft={layersApi.getAttributeStyleDraft}
              updateAttributeStyleDraft={layersApi.updateAttributeStyleDraft}
              setAttributeStyleEnabled={layersApi.setAttributeStyleEnabled}
              attributeStyleColumns={attributeStyleColumns}
              attributeStyleDistinctValues={attributeStyleDistinctValues}
              addAttributeStyleRule={layersApi.addAttributeStyleRule}
              removeAttributeStyleRule={layersApi.removeAttributeStyleRule}
              attributeStyleDistinctLoading={attributeStyleDistinctLoading}
              rgbaToHex={layersApi.rgbaToHex}
              importedLayers={importedLayers}
              toggleImportedLayer={layersApi.toggleImportedLayer}
              setAttributesFromImportedLayer={setAttributesFromImportedLayer}
              setActiveTab={setActiveTab}
              exportLayerAsGeoJSON={layersApi.exportLayerAsGeoJSON}
              removeImportedLayer={layersApi.removeImportedLayer}
              updateLayerStyle={layersApi.updateLayerStyle}
              handleFileImport={layersApi.handleFileImport}
              clearAllImportedLayers={layersApi.clearAllImportedLayers}
              routingToken={routingToken}
              setRoutingToken={setRoutingToken}
              startRoutingMode={layersApi.startRoutingMode}
              clearRouting={clearRouting}
              routingMode={routingMode}
              routingPoints={routingPoints}
              routingLoading={routingLoading}
              routingError={routingError}
            />
          </Tab>

          <Tab eventKey="attributes" title="Attributes">
            <AttributesTab
              attributeData={attributeData}
              activeAttributeLayer={activeAttributeLayer}
              fullscreen={fullscreen}
              setFullscreen={setFullscreen}
              visibleAttributeColumns={attributeControls.visibleAttributeColumns}
              toggleAttributeSort={attributeControls.toggleAttributeSort}
              openAttributeMenu={attributeControls.openAttributeMenu}
              setAttributeMenuOpen={setAttributeMenuOpen}
              attributeSortKey={attributeSortKey}
              attributeSortDir={attributeSortDir}
              attributeMenuOpen={attributeMenuOpen}
              attributeMenuColumn={attributeMenuColumn}
              setAttributeSortKey={setAttributeSortKey}
              setAttributeSortDir={setAttributeSortDir}
              attributeSearch={attributeSearch}
              setAttributeSearch={setAttributeSearch}
              hiddenColumns={hiddenColumns}
              toggleColumnVisibility={attributeControls.toggleColumnVisibility}
              sortedAttributeRows={attributeControls.sortedAttributeRows}
              zoomToFeature={zoomToFeature}
              highlightHoverFeature={highlightHoverFeature}
              clearHoverHighlight={clearHoverHighlight}
              renderValue={attributeControls.renderValue}
            />
          </Tab>

          <Tab eventKey="query" title="Query Module">
            <QueryTab
              query={query}
              setQuery={setQuery}
              attributeData={attributeData}
              queryDistinctValues={queryDistinctValues}
              queryDistinctLoading={queryDistinctLoading}
              applyQuery={attributeControls.applyQuery}
              resetQuery={attributeControls.resetQuery}
            />
          </Tab>

          <Tab eventKey="analysis" title="Analysis">
            <AnalysisTab
              analysisTool={analysisTool}
              setAnalysisTool={setAnalysisTool}
              setBufferMode={setBufferMode}
              clearHeatmap={clearHeatmap}
              clearSpatialQuery={clearSpatialQuery}
              clearOsmDataTool={clearOsmDataTool}
              bufferTargetLayer={bufferTargetLayer}
              clearBufferSelectionFilter={clearBufferSelectionFilter}
              setBufferTargetLayer={setBufferTargetLayer}
              setBufferError={setBufferError}
              setBufferResultCount={setBufferResultCount}
              bufferLayerRef={bufferLayerRef}
              focusSelectedBufferLayer={focusSelectedBufferLayer}
              bufferTargetOptions={bufferTargetOptions}
              spatialQueryLayerOptions={spatialQueryLayerOptions}
              bufferInputMode={bufferInputMode}
              setBufferInputMode={setBufferInputMode}
              bufferDistance={bufferDistance}
              setBufferDistance={setBufferDistance}
              startBufferMode={startBufferMode}
              clearBuffer={clearBuffer}
              bufferMode={bufferMode}
              bufferLoading={bufferLoading}
              bufferError={bufferError}
              bufferResultCount={bufferResultCount}
              heatmapTargetLayer={heatmapTargetLayer}
              setHeatmapTargetLayer={setHeatmapTargetLayer}
              setHeatmapError={setHeatmapError}
              heatmapError={heatmapError}
              setHeatmapPointCount={setHeatmapPointCount}
              setHeatmapFields={setHeatmapFields}
              setHeatmapWeightField={setHeatmapWeightField}
              heatmapFields={heatmapFields}
              heatmapWeightField={heatmapWeightField}
              heatmapRadius={heatmapRadius}
              handleHeatmapRadiusChange={handleHeatmapRadiusChange}
              heatmapBlur={heatmapBlur}
              handleHeatmapBlurChange={handleHeatmapBlurChange}
              buildHeatmap={buildHeatmap}
              heatmapLoading={heatmapLoading}
              heatmapPointCount={heatmapPointCount}
              spatialQueryReferenceLayer={spatialQueryReferenceLayer}
              setSpatialQueryReferenceLayer={setSpatialQueryReferenceLayer}
              setSpatialQueryError={setSpatialQueryError}
              spatialQueryTargetLayer={spatialQueryTargetLayer}
              setSpatialQueryTargetLayer={setSpatialQueryTargetLayer}
              spatialQueryOperator={spatialQueryOperator}
              setSpatialQueryOperator={setSpatialQueryOperator}
              SPATIAL_QUERY_OPERATORS={SPATIAL_QUERY_OPERATORS}
              spatialQueryDistance={spatialQueryDistance}
              setSpatialQueryDistance={setSpatialQueryDistance}
              runSpatialQuery={runSpatialQuery}
              spatialQueryLoading={spatialQueryLoading}
              spatialQueryError={spatialQueryError}
              spatialQueryResultCount={spatialQueryResultCount}
              osmAoiInputMode={osmAoiInputMode}
              setOsmAoiInputMode={setOsmAoiInputMode}
              startOsmAoiMode={startOsmAoiMode}
              requestOsmAvailability={requestOsmAvailability}
              osmAoiMode={osmAoiMode}
              osmAoiBbox4326={osmAoiBbox4326}
              osmAvailabilityLoading={osmAvailabilityLoading}
              osmAvailableDatasets={osmAvailableDatasets}
              osmSelectedDatasets={osmSelectedDatasets}
              setOsmSelectedDatasets={setOsmSelectedDatasets}
              importSelectedOsmData={importSelectedOsmData}
              osmImportLoading={osmImportLoading}
              osmDataError={osmDataError}
            />
          </Tab>

          <Tab eventKey="raster" title="Raster">
            <RasterTab
              rasterTheme={rasterTheme}
              setRasterTheme={setRasterTheme}
              uploadedDataset={uploadedDataset}
              handleUploadedDatasetChange={handleUploadedDatasetChange}
              RASTER_DATASET_OPTIONS={RASTER_DATASET_OPTIONS}
              uploadedDateTime={uploadedDateTime}
              setUploadedDateTime={setUploadedDateTime}
              handleRasterImport={handleRasterImport}
              uploadedRasters={uploadedRasters}
              uploadedLeft={uploadedLeft}
              setUploadedLeft={setUploadedLeft}
              uploadedCompareEnabled={uploadedCompareEnabled}
              setUploadedCompareEnabled={setUploadedCompareEnabled}
              uploadedRight={uploadedRight}
              setUploadedRight={setUploadedRight}
              uploadedSwipeEnabled={uploadedSwipeEnabled}
              setUploadedSwipeEnabled={setUploadedSwipeEnabled}
              importedRasterVisible={importedRasterVisible}
              setImportedRasterVisible={setImportedRasterVisible}
              clearImportedRaster={clearImportedRaster}
              demRasters={demRasters}
              profileDem={profileDem}
              setProfileDem={setProfileDem}
              startProfileMode={startProfileMode}
              clearProfile={clearProfile}
              profileMode={profileMode}
              profilePoints={profilePoints}
              profileOpen={profileOpen}
              profileLoading={profileLoading}
              profileError={profileError}
              profileData={profileData}
              profileDemLabel={profileDem}
              profileHover={profileHover}
              setProfileHover={setProfileHover}
              rasterEnabled={rasterEnabled}
              rasterStartYear={rasterStartYear}
              setRasterEnabled={setRasterEnabled}
              setRasterCompareEnabled={setRasterCompareEnabled}
              LULC_YEARS={LULC_YEARS}
              rasterCompareEnabled={rasterCompareEnabled}
              rasterEndYear={rasterEndYear}
              setRasterStartYear={setRasterStartYear}
              setRasterEndYear={setRasterEndYear}
              rasterAnalysisOpen={rasterAnalysisOpen}
              setRasterAnalysisOpen={setRasterAnalysisOpen}
              rasterMode={rasterMode}
              setRasterMode={setRasterMode}
              LULC_LEGEND={LULC_LEGEND}
            />
          </Tab>
          <Tab eventKey="3D" title="3D Analysis">
            <ThreeDTab
              threeD_layers={[
                ...threeD_layers,
                ...imported3DTiles.map((layer) => ({ id: layer.id, name: layer.name })),
              ]}
              active3DLayers={active3DLayers}
              setActive3DLayers={setActive3DLayers}
              threeDAnalysisTool={threeDAnalysisTool}
              setThreeDAnalysisTool={setThreeDAnalysisTool}
              setThreeDAnalysisStartToken={setThreeDAnalysisStartToken}
              setThreeDAnalysisClearToken={setThreeDAnalysisClearToken}
              threeDStylingAttribute={threeDStylingAttribute}
              setThreeDStylingAttribute={setThreeDStylingAttribute}
              threeDObserverHeight={threeDObserverHeight}
              setThreeDObserverHeight={setThreeDObserverHeight}
              threeDViewshedRange={threeDViewshedRange}
              setThreeDViewshedRange={setThreeDViewshedRange}
              threeDImportFiles={threeDImportFiles}
              setThreeDImportFiles={setThreeDImportFiles}
              inspectThreeDAttributes={inspectThreeDAttributes}
              threeDImportName={threeDImportName}
              setThreeDImportName={setThreeDImportName}
              threeDImportFields={threeDImportFields}
              threeDImportHeightColumn={threeDImportHeightColumn}
              setThreeDImportHeightColumn={setThreeDImportHeightColumn}
              threeDImportDiameterColumn={threeDImportDiameterColumn}
              setThreeDImportDiameterColumn={setThreeDImportDiameterColumn}
              threeDInspectLoading={threeDInspectLoading}
              threeDImportCrs={threeDImportCrs}
              setThreeDImportCrs={setThreeDImportCrs}
              threeDImportLoading={threeDImportLoading}
              threeDImportError={threeDImportError}
              importThreeDTiles={importThreeDTiles}
              undergroundMode={undergroundMode}
              setUndergroundMode={setUndergroundMode}
              flyToLayer={flyToLayer}
              delete3DLayer={delete3DLayer}
            />
          </Tab>
                  </Tabs>
      </div>

      {!sidebarOpen && (
        <button className="expand-btn" onClick={() => setSidebarOpen(true)}>
          ☰
        </button>
      )}

      <div className="map-wrapper">
        {activeTab !== '3D' && (
          <div
            className={`chat-assistant ${activeTab === 'raster' && rasterTheme === 'LULC' ? 'with-lulc' : ''}`}
            ref={chatAssistantRef}
          >
            <button
              type="button"
              className="chat-assistant-btn"
              onClick={() => setChatAssistantOpen((prev) => !prev)}
            >
              Assistant
            </button>
            {chatAssistantOpen && (
              <div className="chat-assistant-panel">
                <div className="chat-assistant-header">
                  <span>Map Chat Assistant</span>
                  <button
                    type="button"
                    className="chat-assistant-close"
                    onClick={() => setChatAssistantOpen(false)}
                  >
                    ×
                  </button>
                </div>

                <div className="chat-assistant-body">
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`chat-bubble ${message.role === 'user' ? 'user' : 'assistant'}`}
                    >
                      {message.text}
                    </div>
                  ))}
                </div>

                <div className="chat-quick-prompts">
                  {CHAT_QUICK_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      className="chat-prompt-chip"
                      disabled={chatLoading}
                      onClick={() => sendChatMessage(prompt)}
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <form
                  className="chat-assistant-input-row"
                  onSubmit={(event) => {
                    event.preventDefault();
                    sendChatMessage(chatInput);
                  }}
                >
                  <input
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    disabled={chatLoading}
                    placeholder="Ask about the map..."
                  />
                  <button type="submit" disabled={chatLoading || !chatInput.trim()}>
                    {chatLoading ? 'Thinking...' : 'Send'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

        <div
          className={`basemap-picker ${activeTab === 'raster' && rasterTheme === 'LULC' ? 'with-lulc' : ''}`}
          ref={basemapPickerRef}
        >
          <button
            type="button"
            className="basemap-picker-btn"
            onClick={() => setBasemapPickerOpen((prev) => !prev)}
          >
            Base Map
          </button>
          {basemapPickerOpen && (
            <div className="basemap-picker-panel">
              <div className="basemap-picker-header">
                <span>Base Map</span>
                <button
                  type="button"
                  className="basemap-picker-close"
                  onClick={() => setBasemapPickerOpen(false)}
                >
                  ×
                </button>
              </div>
              <div className="basemap-picker-grid">
                {BASEMAP_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`basemap-card ${(activeTab === '3D' ? selected3DBasemap : selectedBasemap) === option.id ? 'active' : ''}`}
                    onClick={() => {
                      if (activeTab !== '3D' && baseLayerRef.current) {
                        baseLayerRef.current.setSource(createBasemapSource(option.id));
                      }
                      if (activeTab === '3D') {
                        setSelected3DBasemap(option.id);
                      } else {
                        setSelectedBasemap(option.id);
                      }
                      setBasemapPickerOpen(false);
                    }}
                  >
                    <span
                      className={`basemap-card-thumb ${option.id === 'blank' ? 'blank' : ''}`}
                      style={option.thumb ? { backgroundImage: `url(${option.thumb})` } : undefined}
                    />
                    <span className="basemap-card-label">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div id="map" className={`map-view ${activeTab === '3D' ? 'hidden-map' : ''}`}>
          <div ref={popupRef} className="ol-popup">
            {featureInfo && (
              <>
                <div className="popup-header" onMouseDown={onPopupMouseDown}>
                  Feature Info
                  <button className="popup-close" onClick={closePopup}>
                    ✕
                  </button>
                </div>
                <div className="popup-body">
                  <table className="popup-table">
                    <tbody>
                      {Object.entries(featureInfo)
                        .filter(([, v]) => typeof v !== 'object')
                        .map(([k, v]) => (
                          <tr key={k}>
                            <td>{k}</td>
                            <td>{attributeControls.renderValue(v)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {activeTab === '3D' && (
          <Cesium3DView
            activeLayerIds={active3DLayers}
            importedTilesetLayers={imported3DTiles}
            selectedBasemap={selected3DBasemap}
            tool={threeDAnalysisTool}
            startToken={threeDAnalysisStartToken}
            clearToken={threeDAnalysisClearToken}
            stylingAttribute={threeDStylingAttribute}
            observerHeight={threeDObserverHeight}
            viewshedRange={threeDViewshedRange}
            undergroundMode={undergroundMode}
            flyToLayerToken={flyToLayerToken}
            targetLayerIdToFly={targetLayerIdToFly}
          />
        )}

        {activeTab === 'raster' && rasterTheme === 'LULC' && (
          <div className="lulc-stats-button">
            <button
              className="analysis-btn"
              onClick={() => setLulcStatsOpen((prev) => !prev)}
            >
              LULC Stats
            </button>
          </div>
        )}

        {activeTab === 'raster' && rasterTheme === 'LULC' && lulcStatsOpen && (
          <div className="lulc-stats-panel">
            <div className="lulc-stats-header">
              <span>LULC Area Of Interest Stats</span>
              <button className="lulc-close" onClick={() => setLulcStatsOpen(false)}>
                ✕
              </button>
            </div>
            <div className="lulc-stats-body">
              <div className="lulc-row">
                <label>Token</label>
                <input
                  type="password"
                  value={lulcToken}
                  onChange={(e) => setLulcToken(e.target.value)}
                  placeholder="Bhuvan token"
                />
              </div>
              <div className="lulc-row lulc-row-inline">
                <button
                  className="analysis-btn"
                  onClick={startLulcAoiDraw}
                  disabled={!lulcToken || lulcAoiMode}
                >
                  {lulcAoiMode ? 'Draw AOI...' : 'Draw AOI'}
                </button>
                <button className="analysis-btn secondary" onClick={clearLulcAoi}>
                  Clear
                </button>
              </div>
              {lulcAoiWkt && (
                <div className="lulc-help">
                  AOI captured. Fetching stats…
                </div>
              )}
              {lulcStatsLoading && <div className="lulc-help">Loading stats…</div>}
              {lulcStatsError && <div className="lulc-error">{lulcStatsError}</div>}
              {lulcStatsData && (
                <>
                  {lulcPieChart}
                  <pre className="lulc-json">
                    {JSON.stringify(lulcStatsData, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>
        )}

        {((rasterTheme === 'LULC' && rasterEnabled && rasterCompareEnabled && rasterMode === 'swipe') ||
          (rasterTheme === 'UPLOAD' && importedRasterVisible && uploadedCompareEnabled && uploadedSwipeEnabled)) && (
            <div
              className="raster-splitter"
              style={{ left: `${rasterSplit * 100}%` }}
            >
              <div
                className="raster-splitter-hit"
                onMouseDown={(event) => {
                  event.preventDefault();
                  rasterDraggingRef.current = true;
                  const mapEl = mapRef.current?.getTargetElement();
                  if (!mapEl) return;
                  const rect = mapEl.getBoundingClientRect();
                  const ratio = (event.clientX - rect.left) / rect.width;
                  setRasterSplit(Math.min(1, Math.max(0, ratio)));
                }}
                onTouchStart={(event) => {
                  const touch = event.touches[0];
                  if (!touch) return;
                  rasterDraggingRef.current = true;
                  const mapEl = mapRef.current?.getTargetElement();
                  if (!mapEl) return;
                  const rect = mapEl.getBoundingClientRect();
                  const ratio = (touch.clientX - rect.left) / rect.width;
                  setRasterSplit(Math.min(1, Math.max(0, ratio)));
                }}
              >
                <div className="raster-splitter-handle">|||</div>
              </div>
            </div>
          )}

      </div>
    </div>
  );
}
