# DFF2glTF Converter
[![NPM Version](https://img.shields.io/npm/v/dff2gltf-converter?style=flat&color=orange)](https://www.npmjs.com/package/dff2gltf-converter)
[![License](https://img.shields.io/github/license/AlterSDB/dff2gltf-converter?color=green)](https://github.com/AlterSDB/dff2gltf-converter/blob/main/LICENSE.md)  
This module will help you convert 3D models from RenderWare format (.dff, .txd) to the modern web-compatible glTF/glB format. 
The tool is useful for developers working with retro GTA games (GTA III, GTA San Andreas, etc.) who want to use models in modern web applications or engines.
This module works with [rw-parser](https://github.com/Timic3/rw-parser).  
## Usage example:
### Code:
```js
  import fs from 'fs';
  import { DffConverter, ModelType } from 'dff2gltf-converter';

  const dffBuffer = fs.readFileSync(`model.dff`); // prepare your .dff and .txd as bytes buffer
  const txdBuffer = fs.readFileSync(`model.txd`);

  const dffConverter = new DffConverter(dffBuffer, txdBuffer, ModelType.OBJECT); // initialize with params

  const result = await dffConverter.convertDffToGltf(); 
  result.exportAs(`./output/result.glb`); // convert and export your model in .gltf or .glb
```
You can choose one of three model types for model conversion:
```js
  ModelType.SKIN
  ModelType.CAR
  ModelType.OBJECT
```
**Notes:** 
* Selecting the wrong type may result in unexpected output after conversion, so be sure to specify the type correctly.
* Cars and skins (III/VC) conversion are currently unavailable right now.

### CLI (Not implemented):
```sh
dff2gltf [dffPath] [txdPath] [ModelType (-s, -m, -c)] [outputPath]
dff2gltf model.dff model.txd -s output.glb
```
This tool is still under development, so stay tuned!
