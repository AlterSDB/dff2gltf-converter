# DFF2GLTF Converter
[![License](https://img.shields.io/badge/license-MIT-007ec6.svg)](https://github.com/AlterSDB/dff2gltf-converter/blob/main/LICENSE.md)  
This module is designed to convert 3D models from RenderWare format (.dff, .txd) to modern web-compatible glTF/glB format. 
The tool is useful for developers working with retro GTA games (GTA III, GTA San Andreas, etc.) and wanting to use models in modern web applications or engines.
This module was made using [@glTF-Transform](https://github.com/donmccurdy/glTF-Transform/) and [@rw-parser](https://github.com/Timic3/rw-parser).  
## Usage example:
### Code:
```js
  import fs from 'fs';
  import { DffConverter, ModelType } from 'dff2gltf-converter';

  const dffBuffer = fs.readFileSync(`model.dff`);
  const txdBuffer = fs.readFileSync(`model.txd`);
  const dffConverter = new DffConverter(dffBuffer, txdBuffer, ModelType.OBJECT);

  dffConverter.convertDffToGltf().then((gltf) => gltf.exportAs(`output.gltf`));
  // You can export your model in both .gltf and .glb formats. Just change the extension of the output file
```
### CLI (Not implemented):
```sh
dff2gltf [dffPath] [txdPath] [ModelType (-s, -m, -c)] [outputPath]
dff2gltf model.dff model.txd -s output.glb
```

You can choose one of three model types for model conversion:
```js
  ModelType.SKIN
  ModelType.CAR
  ModelType.OBJECT
```

**Note:** Selecting the wrong type may result in unexpected output after conversion, so be sure to specify the type correctly.
