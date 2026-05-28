import { useCallback, useEffect, useRef, useState } from 'react';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import {
  ArcGisMapServerImageryProvider,
  Cartesian2,
  Cartesian3,
  Cesium3DTileStyle,
  Cesium3DTileset,
  ClippingPlane,
  ClippingPlaneCollection,
  EllipsoidTerrainProvider,
  Color,
  HeadingPitchRange,
  Ion,
  Matrix4,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventType,
  Terrain,
  Transforms,
  UrlTemplateImageryProvider,
  Viewer,
} from 'cesium';

const TILESET_URL = `${process.env.PUBLIC_URL}/3d_tiles/tileset.json`;
const readCesiumIonToken = () => {
  const envToken = process.env.REACT_APP_CESIUM_ION_TOKEN?.trim();
  if (envToken) {
    return envToken;
  }

  if (typeof window !== 'undefined') {
    const runtimeToken =
      window.CESIUM_ION_TOKEN ||
      window.__CESIUM_ION_TOKEN__ ||
      window.localStorage?.getItem('CESIUM_ION_TOKEN') ||
      window.localStorage?.getItem('REACT_APP_CESIUM_ION_TOKEN');

    if (typeof runtimeToken === 'string' && runtimeToken.trim()) {
      return runtimeToken.trim();
    }
  }

  return '';
};

const CESIUM_ION_TOKEN = readCesiumIonToken();
const TOOL_LABELS = {
  'line-of-sight': 'Line of Sight',
  slice: 'Slice',
  viewshed: 'Viewshed',
};
const VIEWSHED_RAY_COUNT = 28;
const DEFAULT_OBSERVER_HEIGHT_METERS = 1.7;
const DEFAULT_VIEWSHED_RANGE_METERS = 220;

Ion.defaultAccessToken = CESIUM_ION_TOKEN || undefined;

const createWorldTerrain = () =>
  Terrain.fromWorldTerrain({
    requestVertexNormals: true,
    requestWaterMask: true,
  });

const createEllipsoidTerrain = () =>
  new Terrain(Promise.resolve(new EllipsoidTerrainProvider()));

const waitForTerrainReady = (terrain) =>
  new Promise((resolve, reject) => {
    if (!terrain) {
      resolve(null);
      return;
    }

    if (terrain.ready) {
      resolve(terrain.provider);
      return;
    }

    const removeReadyListener = terrain.readyEvent.addEventListener((provider) => {
      removeErrorListener?.();
      resolve(provider);
    });
    const removeErrorListener = terrain.errorEvent.addEventListener((error) => {
      removeReadyListener?.();
      reject(error);
    });
  });

const createImageryProvider = async (basemapId) => {
  switch (basemapId) {
    case 'dark':
      return new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'OpenStreetMap contributors, CARTO',
      });
    case 'gray':
      return new UrlTemplateImageryProvider({
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        subdomains: ['a', 'b', 'c', 'd'],
        credit: 'OpenStreetMap contributors, CARTO',
      });
    case 'elevation':
    case 'terrain':
      return new UrlTemplateImageryProvider({
        url: 'https://tile.opentopomap.org/{z}/{x}/{y}.png',
        credit: 'OpenTopoMap contributors, OpenStreetMap contributors',
      });
    case 'satellite':
      return ArcGisMapServerImageryProvider.fromUrl(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'
      );
    case 'osm':
    default:
      return new OpenStreetMapImageryProvider({
        url: 'https://tile.openstreetmap.org/',
        credit: 'OpenStreetMap contributors',
      });
  }
};

const addPointMarker = (viewer, position, color, label) =>
  viewer.entities.add({
    position,
    point: {
      pixelSize: 11,
      color,
      outlineColor: Color.WHITE,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: label,
      font: '12px sans-serif',
      fillColor: Color.WHITE,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      showBackground: true,
      backgroundColor: Color.fromAlpha(Color.BLACK, 0.55),
      pixelOffset: new Cartesian2(0, -24),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });

const elevatePosition = (position, meters = 1.7) => {
  const up = Cartesian3.normalize(position, new Cartesian3());
  return Cartesian3.add(
    position,
    Cartesian3.multiplyByScalar(up, meters, new Cartesian3()),
    new Cartesian3()
  );
};

// Attribute-based styling function for 3D tileset
/* eslint-disable no-template-curly-in-string, no-unused-vars */
const applyAttributeStyling = (tileset, attributeName, colorMap = {}) => {
  if (!tileset) {
    return;
  }

  // Default color mapping for common building attributes
  const defaultColorMap = {
    'height': {
      conditions: [
        ['${Height} >= 50', 'color("red")'],
        ['${Height} >= 30', 'color("orange")'],
        ['${Height} >= 20', 'color("yellow")'],
        ['${Height} >= 10', 'color("green")'],
        ['true', 'color("blue")']
      ]
    },
    'building_type': {
      conditions: [
        ['${BuildingType} === "residential"', 'color("lightblue")'],
        ['${BuildingType} === "commercial"', 'color("orange")'],
        ['${BuildingType} === "industrial"', 'color("gray")'],
        ['${BuildingType} === "public"', 'color("green")'],
        ['true', 'color("white")']
      ]
    },
    'age': {
      conditions: [
        ['${Age} >= 100', 'color("darkred")'],
        ['${Age} >= 50', 'color("brown")'],
        ['${Age} >= 20', 'color("yellow")'],
        ['true', 'color("lightgreen")']
      ]
    },
    'default': {
      conditions: [
        ['true', 'color("#d9e2e8")']
      ]
    }
  };

  const styleConfig = colorMap[attributeName] || defaultColorMap[attributeName] || defaultColorMap['default'];

  try {
    tileset.style = new Cesium3DTileStyle({
      color: {
        conditions: styleConfig.conditions
      }
    });
  } catch (error) {
    // Fallback to default white color
    tileset.style = new Cesium3DTileStyle({
      color: 'color("#d9e2e8")'
    });
  }
};
/* eslint-enable no-template-curly-in-string, no-unused-vars */

function Cesium3DView({
  activeLayerIds = [],
  importedTilesetLayers = [],
  selectedBasemap = 'osm',
  tool,
  startToken,
  clearToken,
  stylingAttribute,
  observerHeight = DEFAULT_OBSERVER_HEIGHT_METERS,
  viewshedRange = DEFAULT_VIEWSHED_RANGE_METERS,
  undergroundMode = false,
  flyToLayerToken = 0,
  targetLayerIdToFly = null,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const tilesetRef = useRef(null);
  const importedTilesetsRef = useRef(new Map());
  const tilesetBaseMatrixRef = useRef(null);
  const activeLayerIdsRef = useRef(activeLayerIds);
  const analysisEntitiesRef = useRef([]);
  const interactionCleanupRef = useRef(null);
  const [canInitialize, setCanInitialize] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('Loading Cesium 3D analysis scene...');

  const getShouldUseTerrain = useCallback(
    () => selectedBasemap === 'terrain' && Boolean(CESIUM_ION_TOKEN),
    [selectedBasemap]
  );

  useEffect(() => {
    activeLayerIdsRef.current = activeLayerIds;
  }, [activeLayerIds]);

  useEffect(() => {
    if (targetLayerIdToFly == null || !viewerRef.current) {
      return;
    }

    // flyToLayerToken is just a trigger; it may be 0 depending on state timing.
    // So we don’t gate logic on it being truthy.
    if (flyToLayerToken == null) {
      return;
    }

    const importedTileset = importedTilesetsRef.current.get(targetLayerIdToFly);
    if (importedTileset) {
      viewerRef.current.zoomTo(
        importedTileset,
        new HeadingPitchRange(0, CesiumMath.toRadians(-35), 650)
      );
      return;
    }

    // Fallback: the base/default tileset is stored in tilesetRef.current, not in importedTilesetsRef.
    if (tilesetRef.current) {
      viewerRef.current.zoomTo(
        tilesetRef.current,
        new HeadingPitchRange(0, CesiumMath.toRadians(-35), 650)
      );
    }
  }, [flyToLayerToken, targetLayerIdToFly]);

  const clearInteraction = useCallback(() => {
    interactionCleanupRef.current?.();
    interactionCleanupRef.current = null;
  }, []);

  const clearAnalysisGraphics = useCallback(() => {
    const viewer = viewerRef.current;
    if (viewer) {
      analysisEntitiesRef.current.forEach((entity) => viewer.entities.remove(entity));
    }
    analysisEntitiesRef.current = [];

    if (tilesetRef.current) {
      tilesetRef.current.clippingPlanes = undefined;
    }
    importedTilesetsRef.current.forEach((tileset) => {
      tileset.clippingPlanes = undefined;
    });
  }, []);

  const clearAnalysis = useCallback(() => {
    clearInteraction();
    clearAnalysisGraphics();
    setError('');
    setStatus(`Cesium analysis ready. ${TOOL_LABELS[tool]} is selected.`);
  }, [clearAnalysisGraphics, clearInteraction, tool]);

  const rememberEntity = useCallback((entity) => {
    analysisEntitiesRef.current.push(entity);
    return entity;
  }, []);

  const isPickedAnalysisEntity = useCallback((pickedObject) => (
    Boolean(pickedObject?.id) && analysisEntitiesRef.current.includes(pickedObject.id)
  ), []);

  const resizeViewerIfVisible = useCallback(() => {
    const viewer = viewerRef.current;
    const container = containerRef.current;
    if (!viewer || !container) {
      return false;
    }

    const { clientWidth, clientHeight } = container;
    if (clientWidth <= 0 || clientHeight <= 0) {
      return false;
    }

    viewer.resize();
    viewer.scene.requestRender();
    return true;
  }, []);

  const alignTilesetToTerrain = useCallback(async (useTerrain) => {
    const viewer = viewerRef.current;
    const tileset = tilesetRef.current || Array.from(importedTilesetsRef.current.values())[0];
    const baseMatrix = tilesetBaseMatrixRef.current;
    if (!viewer || !tileset || !baseMatrix) {
      return;
    }

    tileset.modelMatrix = Matrix4.clone(baseMatrix, new Matrix4());
    viewer.scene.requestRender();
  }, []);

  const getScenePosition = useCallback((screenPosition) => {
    const viewer = viewerRef.current;
    if (!viewer || !screenPosition) {
      return null;
    }

    const scene = viewer.scene;
    if (scene.pickPositionSupported) {
      const picked = scene.pickPosition(screenPosition);
      if (picked) {
        return picked;
      }
    }

    const ray = viewer.camera.getPickRay(screenPosition);
    if (!ray) {
      return null;
    }

    return scene.globe.pick(ray, scene) ?? null;
  }, []);

  const analyzeLineOfSight = useCallback((observer, target) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return false;
    }

    const safeObserverHeight = Math.max(0, Math.min(100, Number(observerHeight) || DEFAULT_OBSERVER_HEIGHT_METERS));
    const raisedObserver = elevatePosition(observer, safeObserverHeight);

    const direction = Cartesian3.normalize(
      Cartesian3.subtract(target, raisedObserver, new Cartesian3()),
      new Cartesian3()
    );
    
    // Test for obstructions along the ray
    let blocked = false;
    let hitPosition = null;
    const distance = Cartesian3.distance(raisedObserver, target);
    const numSamples = Math.min(50, Math.ceil(distance / 5)); // Sample every 5 meters, max 50 samples
    
    for (let i = 1; i < numSamples; i++) {
      const t = i / numSamples;
      const testPoint = Cartesian3.add(
        raisedObserver,
        Cartesian3.multiplyByScalar(direction, distance * t, new Cartesian3()),
        new Cartesian3()
      );
      
      // Convert world position to screen coordinates
      const screenPos = viewer.scene.cartesianToCanvasCoordinates(testPoint);
      
      if (screenPos) {
        const pickedObject = viewer.scene.pick(screenPos);
        // Check if we hit something that's not empty space
        if (pickedObject && pickedObject.primitive && !isPickedAnalysisEntity(pickedObject)) {
          hitPosition = testPoint;
          blocked = true;
          break;
        }
      }
    }

    rememberEntity(addPointMarker(viewer, raisedObserver, Color.YELLOW, `Observer ${safeObserverHeight}m`));
    rememberEntity(addPointMarker(viewer, target, blocked ? Color.RED : Color.LIME, 'Target'));

    if (blocked && hitPosition) {
      rememberEntity(
        viewer.entities.add({
          polyline: {
            positions: [raisedObserver, hitPosition],
            width: 4,
            material: Color.LIME,
            clampToGround: false,
          },
        })
      );
      rememberEntity(
        viewer.entities.add({
          polyline: {
            positions: [hitPosition, target],
            width: 4,
            material: Color.RED,
            clampToGround: false,
          },
        })
      );
      setStatus('Line of sight blocked. Green segment is visible; red segment is obstructed by the tiles.');
      return false;
    }

    rememberEntity(
      viewer.entities.add({
        polyline: {
          positions: [raisedObserver, target],
          width: 4,
          material: Color.LIME,
          clampToGround: false,
        },
      })
    );
    setStatus('Line of sight clear between observer and target.');
    return true;
  }, [isPickedAnalysisEntity, observerHeight, rememberEntity]);

  const runViewshed = useCallback((observer) => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    const safeRange = Math.max(25, Math.min(1000, Number(viewshedRange) || DEFAULT_VIEWSHED_RANGE_METERS));
    const safeObserverHeight = Math.max(0, Math.min(100, Number(observerHeight) || DEFAULT_OBSERVER_HEIGHT_METERS));
    const raisedObserver = elevatePosition(observer, safeObserverHeight);

    rememberEntity(addPointMarker(viewer, raisedObserver, Color.YELLOW, `Observer ${safeObserverHeight}m`));

    const enu = Transforms.eastNorthUpToFixedFrame(raisedObserver);
    let visibleCount = 0;

    for (let index = 0; index < VIEWSHED_RAY_COUNT; index += 1) {
      const heading = (index / VIEWSHED_RAY_COUNT) * CesiumMath.TWO_PI;
      const targetLocal = new Cartesian3(
        Math.cos(heading) * safeRange,
        Math.sin(heading) * safeRange,
        0
      );
      const target = Matrix4.multiplyByPoint(enu, targetLocal, new Cartesian3());
      const direction = Cartesian3.normalize(
        Cartesian3.subtract(target, raisedObserver, new Cartesian3()),
        new Cartesian3()
      );
      
      // Test along this ray
      let blocked = false;
      const distance = Cartesian3.distance(raisedObserver, target);
      const numTestPoints = 20;
      
      for (let j = 1; j < numTestPoints; j++) {
        const testPoint = Cartesian3.add(
          raisedObserver,
          Cartesian3.multiplyByScalar(direction, (distance / numTestPoints) * j, new Cartesian3()),
          new Cartesian3()
        );
        
        const screenPos = viewer.scene.cartesianToCanvasCoordinates(testPoint);
        if (screenPos) {
          const pickedObject = viewer.scene.pick(screenPos);
          if (pickedObject && pickedObject.primitive && !isPickedAnalysisEntity(pickedObject)) {
            blocked = true;
            // Only draw up to the obstruction
            const end = testPoint;
            rememberEntity(
              viewer.entities.add({
                polyline: {
                  positions: [raisedObserver, end],
                  width: 2,
                  material: Color.fromCssColorString('#ef4444'),
                  clampToGround: false,
                },
              })
            );
            break;
          }
        }
      }
      
      if (!blocked) {
        visibleCount += 1;
        rememberEntity(
          viewer.entities.add({
            polyline: {
              positions: [raisedObserver, target],
              width: 2,
              material: Color.fromCssColorString('#22c55e'),
              clampToGround: false,
            },
          })
        );
      }
    }

    setStatus(`Viewshed complete at ${safeObserverHeight}m height and ${safeRange}m range. ${visibleCount}/${VIEWSHED_RAY_COUNT} sample rays stayed visible.`);
  }, [isPickedAnalysisEntity, observerHeight, rememberEntity, viewshedRange]);

  const applySlicePlane = useCallback((origin) => {
    const viewer = viewerRef.current;
    const tileset = tilesetRef.current;
    if (!viewer || !tileset) {
      return;
    }

    const enu = Transforms.eastNorthUpToFixedFrame(origin);
    const inverseEnu = Matrix4.inverseTransformation(enu, new Matrix4());
    const cameraDirectionLocal = Matrix4.multiplyByPointAsVector(
      inverseEnu,
      viewer.camera.directionWC,
      new Cartesian3()
    );

    // Create a normal perpendicular to the camera direction in the horizontal plane
    // For a vertical slice, we want the normal to be horizontal (z=0)
    const horizontalDirection = new Cartesian3(cameraDirectionLocal.x, cameraDirectionLocal.y, 0);
    const magnitude = Cartesian3.magnitude(horizontalDirection);

    let normal;
    if (magnitude > CesiumMath.EPSILON6) {
      // Rotate 90 degrees around Z axis to get perpendicular direction
      normal = new Cartesian3(-horizontalDirection.y, horizontalDirection.x, 0);
      Cartesian3.normalize(normal, normal);
    } else {
      // Fallback: use east direction if camera is looking straight down
      normal = new Cartesian3(1, 0, 0);
    }

    tileset.clippingPlanes = new ClippingPlaneCollection({
      modelMatrix: enu,
      planes: [new ClippingPlane(normal, 0)],
      edgeColor: Color.WHITE,
      edgeWidth: 2,
      unionClippingRegions: true,
    });

    rememberEntity(addPointMarker(viewer, origin, Color.CYAN, 'Slice Plane'));
    setStatus('Slice plane applied. Move the camera to a better angle and click Start Analysis again to place a new cut.');
  }, [rememberEntity]);

  useEffect(() => {
    if (!canInitialize || !containerRef.current || viewerRef.current) {
      return undefined;
    }

    const { clientWidth, clientHeight } = containerRef.current;
    if (clientWidth <= 0 || clientHeight <= 0) {
      return undefined;
    }

    window.CESIUM_BASE_URL = `${process.env.PUBLIC_URL}/cesium`;

    let viewer;
    try {
      viewer = new Viewer(containerRef.current, {
        animation: false,
        baseLayerPicker: false,
        fullscreenButton: false,
        geocoder: false,
        homeButton: true,
        infoBox: false,
        navigationHelpButton: false,
        sceneModePicker: false,
        selectionIndicator: false,
        timeline: false,
        baseLayer: false,
        terrain: getShouldUseTerrain() ? createWorldTerrain() : createEllipsoidTerrain(),
        requestRenderMode: false,
        maximumRenderTimeChange: 1 / 60,
        shouldAnimate: true,
      });
    } catch (viewerError) {
      console.error('Failed to initialize Cesium viewer:', viewerError);
      setError('Cesium could not initialize WebGL in this view.');
      setStatus('Cesium analysis failed to load.');
      return undefined;
    }

    viewer.scene.globe.show = true;
    viewer.scene.backgroundColor = Color.fromCssColorString('#cfd8df');
    viewer.scene.globe.baseColor = Color.fromCssColorString('#d7e1e8');
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.globe.maximumScreenSpaceError = 2;
    viewer.scene.globe.tileCacheSize = 200;
    viewer.scene.undergroundMode = undergroundMode;
    viewer.scene.light.intensity = 2.4;
    viewer.scene.highDynamicRange = false;
    viewer.scene.skyAtmosphere.show = true;
    viewer.cesiumWidget.creditContainer.style.display = 'none';
    viewerRef.current = viewer;
    const importedTilesets = importedTilesetsRef.current;

    const resizeObserver = new ResizeObserver(() => {
      resizeViewerIfVisible();
    });
    resizeObserver.observe(containerRef.current);

    let cancelled = false;

    const loadScene = async () => {
      try {
        const tileset = await Cesium3DTileset.fromUrl(TILESET_URL);

        if (cancelled) {
          return;
        }

        tileset.show = activeLayerIdsRef.current.includes('jumc_buildings');
        tileset.dynamicScreenSpaceError = true;
        tileset.skipLevelOfDetail = true;
        tileset.maximumScreenSpaceError = 8;
        tileset.backFaceCulling = false;
        tileset.colorBlendAmount = 0.75;
        tileset.preloadWhenHidden = false;
        tileset.preferLeaves = false;
        viewer.scene.primitives.add(tileset);
        tilesetRef.current = tileset;
        tilesetBaseMatrixRef.current = Matrix4.clone(tileset.modelMatrix, new Matrix4());

        await alignTilesetToTerrain(getShouldUseTerrain());
        viewer.scene.requestRender();

        await viewer.zoomTo(
          tileset,
          new HeadingPitchRange(0, CesiumMath.toRadians(-35), 450)
        );

        if (!cancelled) {
          setReady(true);
          setStatus('Cesium analysis ready.');
        }
      } catch (loadError) {
        console.error('Failed to load Cesium 3D analysis scene:', loadError);
        if (!cancelled) {
          setError('Unable to load 3D tiles in Cesium analysis mode.');
          setStatus('Cesium analysis failed to load.');
        }
      }
    };

    loadScene();

    return () => {
      cancelled = true;
      clearInteraction();
      clearAnalysisGraphics();
      tilesetRef.current = null;
      importedTilesets.forEach((tileset) => {
        viewer.scene.primitives.remove(tileset);
      });
      importedTilesets.clear();
      tilesetBaseMatrixRef.current = null;
      resizeObserver.disconnect();
      viewer.destroy();
      viewerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alignTilesetToTerrain, canInitialize, clearAnalysisGraphics, clearInteraction, getShouldUseTerrain, resizeViewerIfVisible]);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }
    viewerRef.current.scene.undergroundMode = undergroundMode;
  }, [undergroundMode]);

  useEffect(() => {
    let frameId = 0;
    const waitForVisibleSize = () => {
      if (viewerRef.current || canInitialize) {
        return;
      }

      const container = containerRef.current;
      if (container && container.clientWidth > 0 && container.clientHeight > 0) {
        setCanInitialize(true);
        return;
      }

      frameId = window.requestAnimationFrame(waitForVisibleSize);
    };

    frameId = window.requestAnimationFrame(waitForVisibleSize);
    return () => window.cancelAnimationFrame(frameId);
  }, [canInitialize]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return undefined;
    }

    let cancelled = false;

    const applyBasemap = async () => {
      try {
        const imageryProvider = await createImageryProvider(selectedBasemap);
        if (cancelled || !viewerRef.current) {
          return;
        }

        viewer.imageryLayers.removeAll();
        viewer.imageryLayers.addImageryProvider(imageryProvider);

        const useTerrain = getShouldUseTerrain();
        const keepEllipsoidBuildingBase = false;
        const terrain = useTerrain ? createWorldTerrain() : createEllipsoidTerrain();
        viewer.scene.setTerrain(terrain);
        await waitForTerrainReady(terrain);
        await alignTilesetToTerrain(
          useTerrain && !keepEllipsoidBuildingBase
        );

        viewer.scene.globe.enableLighting = selectedBasemap === 'terrain';
        viewer.scene.verticalExaggeration = 1.0;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.requestRender();

        if (useTerrain && tilesetRef.current) {
          await viewer.flyTo(
            tilesetRef.current,
            {
              offset: new HeadingPitchRange(
                0,
                CesiumMath.toRadians(-42),
                1400
              ),
              duration: 0.8,
            }
          );
        }

        if (!cancelled) {
          setError('');
          if (selectedBasemap === 'terrain' && !CESIUM_ION_TOKEN) {
            setStatus('Terrain basemap uses topographic imagery. No Cesium ion token was detected in env or runtime config.');
          }
        }
      } catch (basemapError) {
        console.error('Failed to apply Cesium basemap:', basemapError);
        if (!cancelled) {
          setError('Unable to switch the 3D basemap.');
        }
      }
    };

    applyBasemap();

    return () => {
      cancelled = true;
    };
  }, [alignTilesetToTerrain, getShouldUseTerrain, selectedBasemap]);

  useEffect(() => {
    resizeViewerIfVisible();
  }, [resizeViewerIfVisible, selectedBasemap]);

  useEffect(() => {
    if (tilesetRef.current) {
      tilesetRef.current.show = activeLayerIdsRef.current.includes('jumc_buildings');
    }
    importedTilesetsRef.current.forEach((tileset, id) => {
      tileset.show = activeLayerIdsRef.current.includes(id);
    });
    viewerRef.current?.scene?.requestRender?.();
  }, [activeLayerIds]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) {
      return undefined;
    }

    let cancelled = false;
    const configuredIds = new Set(importedTilesetLayers.map((layer) => layer.id));

    importedTilesetsRef.current.forEach((tileset, id) => {
      if (!configuredIds.has(id)) {
        viewer.scene.primitives.remove(tileset);
        importedTilesetsRef.current.delete(id);
      }
    });

    const loadImportedTilesets = async () => {
      for (const layer of importedTilesetLayers) {
        if (!layer?.id || !layer?.url || importedTilesetsRef.current.has(layer.id)) {
          continue;
        }

        try {
          const tileset = await Cesium3DTileset.fromUrl(layer.url);
          if (cancelled || !viewerRef.current) {
            return;
          }

          tileset.show = activeLayerIdsRef.current.includes(layer.id);
          tileset.dynamicScreenSpaceError = true;
          tileset.skipLevelOfDetail = true;
          tileset.maximumScreenSpaceError = 8;
          tileset.backFaceCulling = false;
          tileset.colorBlendAmount = 0.75;
          tileset.preloadWhenHidden = false;
          viewer.scene.primitives.add(tileset);
          importedTilesetsRef.current.set(layer.id, tileset);
          applyAttributeStyling(tileset, stylingAttribute || 'default');

          if (tileset.show) {
            await viewer.flyTo(
              tileset,
              new HeadingPitchRange(0, CesiumMath.toRadians(-35), 650)
            );
          }
          viewer.scene.requestRender();
        } catch (loadError) {
          console.error('Failed to load imported 3D tiles:', loadError);
          if (!cancelled) {
            setError(`Unable to load imported 3D tiles: ${layer.name || layer.id}`);
          }
        }
      }
    };

    loadImportedTilesets();

    return () => {
      cancelled = true;
    };
  }, [importedTilesetLayers, stylingAttribute]);

  useEffect(() => {
    if (!ready) {
      return;
    }

    setStatus(`Cesium analysis ready. ${TOOL_LABELS[tool]} is selected.`);
  }, [ready, tool]);

  useEffect(() => {
    if (!ready || !startToken) {
      return;
    }

    clearAnalysisGraphics();
    clearInteraction();
    setError('');

    const viewer = viewerRef.current;
    if (!viewer) {
      return;
    }

    if (tool === 'line-of-sight') {
      let observer = null;
      setStatus('Line of Sight: click the observer point, then click the target point on the buildings.');
      const onClick = (movement) => {
        const picked = getScenePosition(movement.position);
        if (!picked) {
          setError('Click directly on the 3D tiles to place the analysis.');
          return;
        }

        if (!observer) {
          observer = picked;
          rememberEntity(addPointMarker(viewer, observer, Color.YELLOW, 'Observer'));
          setStatus('Observer placed. Click the target point.');
          return;
        }

        clearAnalysisGraphics();
        analyzeLineOfSight(observer, picked);
        clearInteraction();
      };

      viewer.screenSpaceEventHandler.setInputAction(onClick, ScreenSpaceEventType.LEFT_CLICK);
      interactionCleanupRef.current = () => {
        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      };
      return;
    }

    if (tool === 'viewshed') {
      setStatus('Viewshed: click the observer point on the buildings.');
      const onClick = (movement) => {
        const picked = getScenePosition(movement.position);
        if (!picked) {
          setError('Click directly on the 3D tiles to place the viewshed observer.');
          return;
        }

        clearAnalysisGraphics();
        runViewshed(picked);
        clearInteraction();
      };

      viewer.screenSpaceEventHandler.setInputAction(onClick, ScreenSpaceEventType.LEFT_CLICK);
      interactionCleanupRef.current = () => {
        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      };
      return;
    }

    if (tool === 'slice') {
      setStatus('Slice: click a point on the buildings to place a vertical clipping plane.');
      const onClick = (movement) => {
        const picked = getScenePosition(movement.position);
        if (!picked) {
          setError('Click directly on the 3D tiles to place the slice plane.');
          return;
        }

        clearAnalysisGraphics();
        applySlicePlane(picked);
        clearInteraction();
      };

      viewer.screenSpaceEventHandler.setInputAction(onClick, ScreenSpaceEventType.LEFT_CLICK);
      interactionCleanupRef.current = () => {
        viewer.screenSpaceEventHandler.removeInputAction(ScreenSpaceEventType.LEFT_CLICK);
      };
    }
  }, [
    analyzeLineOfSight,
    applySlicePlane,
    clearAnalysisGraphics,
    clearInteraction,
    getScenePosition,
    ready,
    rememberEntity,
    runViewshed,
    startToken,
    tool,
  ]);

  useEffect(() => {
    if (!ready || !stylingAttribute) {
      return;
    }

    const tileset = tilesetRef.current;
    if (tileset) {
      applyAttributeStyling(tileset, stylingAttribute);
    }
    importedTilesetsRef.current.forEach((importedTileset) => {
      applyAttributeStyling(importedTileset, stylingAttribute);
    });
    viewerRef.current?.scene.requestRender();
  }, [ready, stylingAttribute]);

  useEffect(() => {
    if (!ready || !clearToken) {
      return;
    }

    clearAnalysis();
  }, [clearAnalysis, clearToken, ready]);

  return (
    <div className="cesium-shell">
      <div ref={containerRef} className="cesium-view" />
      <div className="arcgis-analysis-status">
        <div className="arcgis-analysis-title">Cesium 3D Analysis</div>
        <div>{status}</div>
        {error && <div className="arcgis-analysis-error">{error}</div>}
      </div>
      {error && <div className="cesium-error">{error}</div>}
    </div>
  );
}

export default Cesium3DView;
