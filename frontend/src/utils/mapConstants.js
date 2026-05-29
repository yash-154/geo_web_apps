// Shared map constants extracted from MapView.js
export const INITIAL_LAYERS = [
  {
    id: 'roads',
    title: '🛣 Roads',
    layerName: 'yash_practise:tbl_roads_pcmc',
    apiLayer: 'roads',
    geometryType: 'line',
    visible: false,
    style: {
      strokeColor: '#2563eb',
      fillColor: 'rgba(37,99,235,0.2)',
      strokeWidth: 2,
      opacity: 1,
    },
  },
  {
    id: 'Water Body',
    title: 'Water Body',
    layerName: 'yash_practise:tbl_rivers_pcmc',
    apiLayer: 'waterbody',
    geometryType: 'polygon',
    visible: false,
    style: {
      strokeColor: '#0ea5e9',
      fillColor: 'rgba(14,165,233,0.25)',
      strokeWidth: 2,
      opacity: 1,
    },
  },
  {
    id: 'Land Use',
    title: 'Land Use',
    layerName: 'yash_practise:tbl_landuse',
    apiLayer: 'landuse',
    geometryType: 'polygon',
    visible: false,
    style: {
      strokeColor: '#16a34a',
      fillColor: 'rgba(22,163,74,0.2)',
      strokeWidth: 2,
      opacity: 1,
    },
  },
  {
    id: 'Landmarks',
    title: 'Landmarks',
    layerName: 'yash_practise:tbl_landmarks',
    apiLayer: 'landmarks',
    geometryType: 'point',
    visible: false,
    style: {
      strokeColor: '#f97316',
      fillColor: 'rgba(249,115,22,0.2)',
      strokeWidth: 2,
      opacity: 1,
    },
  },
];

export const threeD_layers = [
  {
    id: 'jumc_buildings',
  },
];

export const LULC_YEARS = [
  { label: '2020-21', layer: 'LULC250K_2021', year: 2020 },
  { label: '2021-22', layer: 'LULC250K_2122', year: 2021 },
  { label: '2022-23', layer: 'LULC250K_2223', year: 2022 },
  { label: '2023-24', layer: 'LULC250K_2324', year: 2023 },
  { label: '2024-25', layer: 'LULC250K_2425', year: 2024 },
];

export const LULC_LEGEND = [
  { label: 'Built-up land', color: '#e00000' },
  { label: 'Kharif crop land', color: '#f7c600' },
  { label: 'Rabi crop land', color: '#ff9a00' },
  { label: 'Zaid crop land', color: '#c38a2b' },
  { label: 'Double/Triple/Annual crop land', color: '#6aa84f' },
  { label: 'Current Fallow land', color: '#d9ead3' },
  { label: 'Plantation/Orchard', color: '#00a651' },
  { label: 'Evergreen/Semi-evergreen woodland', color: '#0b6623' },
  { label: 'Deciduous woodland', color: '#3d5b1f' },
  { label: 'Degraded woodland', color: '#8fbc8f' },
  { label: 'Littoral/Swamp/Mangroves', color: '#00a99d' },
  { label: 'Grassland', color: '#b4d455' },
  { label: 'Shifting cultivation', color: '#8a2be2' },
  { label: 'Wastelands', color: '#c0a06d' },
  { label: 'Rann', color: '#b7b7b7' },
  { label: 'Water Bodies - maximum spread', color: '#1b6fe5' },
  { label: 'Water Bodies - minimum spread', color: '#69c0ff' },
  { label: 'Snow covered/Glacial areas', color: '#f5cccc' },
];

export const RASTER_DATASET_OPTIONS = ['DEM', 'LULC', 'SLOPE', 'ASPECT'];

export const SPATIAL_QUERY_OPERATORS = [
  { value: 'touching_or_contained', label: 'touching or contained' },
  { value: 'inside', label: 'inside' },
  { value: 'not_inside', label: 'not inside' },
  { value: 'within', label: 'within' },
  { value: 'not_within', label: 'not within' },
  { value: 'closest_within', label: 'closest and within' },
  { value: 'connected', label: 'connected' },
  { value: 'overlap_any', label: 'select whether or not areas overlap' },
  { value: 'overlap_single', label: 'select only in areas that do not overlap' },
  { value: 'overlap_multiple', label: 'select only in overlapping areas' },
];

export const OSM_DATASETS = [
  { key: 'roads', label: 'Roads', filter: 'way["highway"]' },
  { key: 'buildings', label: 'Buildings', filter: 'way["building"]' },
  { key: 'amenities', label: 'Amenities', filter: 'node["amenity"];way["amenity"]' },
  { key: 'water', label: 'Water bodies / waterways', filter: 'way["waterway"];way["natural"="water"];way["landuse"="reservoir"]' },
  { key: 'green', label: 'Parks / Green areas', filter: 'way["leisure"="park"];way["landuse"="grass"];way["landuse"="forest"]' },
];

export const CHAT_QUICK_PROMPTS = [
  'Show roads summary',
  'List nearby landmarks',
  'Explain land use layer',
  'How to run spatial query',
];

export const MAX_ATTRIBUTE_SLD_RULES = 12;

export const NAMED_STYLES_STORAGE_KEY = 'smartcity_named_styles_v1';
export const LAYER_STYLES_STORAGE_KEY = 'smartcity_layer_styles_v1';
export const LAYER_STYLE_SELECTION_STORAGE_KEY = 'smartcity_layer_style_selection_v1';

export const DEFAULT_NAMED_STYLES = [
  {
    name: 'Default Blue',
    style: { strokeColor: '#2563eb', fillColor: 'rgba(37,99,235,0.2)', strokeWidth: 2, opacity: 1 },
  },
  {
    name: 'Water Cyan',
    style: { strokeColor: '#0ea5e9', fillColor: 'rgba(14,165,233,0.25)', strokeWidth: 2, opacity: 1 },
  },
  {
    name: 'Land Green',
    style: { strokeColor: '#16a34a', fillColor: 'rgba(22,163,74,0.2)', strokeWidth: 2, opacity: 1 },
  },
];
