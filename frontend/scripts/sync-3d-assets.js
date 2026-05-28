const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const copyTargets = [
  {
    label: '3D tiles',
    from: path.join(projectRoot, 'src', '3d_tiles'),
    to: path.join(projectRoot, 'public', '3d_tiles'),
    required: true,
  },
  {
    label: 'Cesium runtime',
    from: path.join(projectRoot, 'node_modules', 'cesium', 'Build', 'Cesium'),
    to: path.join(projectRoot, 'public', 'cesium'),
    required: false,
  },
];

for (const target of copyTargets) {
  if (!fs.existsSync(target.from)) {
    if (target.required) {
      console.error(`Missing required source folder: ${target.from}`);
      process.exit(1);
    }
    continue;
  }

  fs.rmSync(target.to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(target.to), { recursive: true });
  fs.cpSync(target.from, target.to, { recursive: true });
  console.log(`Synced ${target.label}: ${path.relative(projectRoot, target.to)}`);
}
