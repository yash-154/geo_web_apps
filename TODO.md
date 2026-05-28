# TODO - Fix ogr2ogr missing during Mago 3D preprocessing

- [ ] Inspect current 3D tile import endpoint and preprocessing flow (views.py)
- [ ] Implement stable “correct way”:
  - [ ] Add hard dependency check with clear install hint when preprocessing is required
  - [ ] Add fallback behavior toggle (env/config) to either fail fast or skip preprocessing
  - [ ] Ensure error message returns to frontend consistently
- [ ] (Optional, if existing) Add project docs / scripts to install GDAL/ogr2ogr for dev/prod
- [ ] Run backend checks/tests (python manage.py check)
- [ ] Provide final run instructions (system packages / env var toggle)

