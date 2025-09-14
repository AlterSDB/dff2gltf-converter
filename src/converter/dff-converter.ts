import { Document, Primitive, Node, Scene, PropertyType, Material, Accessor } from '@gltf-transform/core';
import { dedup, textureCompress, weld } from '@gltf-transform/functions';
import { DffParser, RwBinMesh, RwDff, RwGeometry, RwMesh, RwTextureCoordinate, RwTxd, RwVector3, TxdParser } from 'rw-parser';
import { mat4, quat, vec3 } from 'gl-matrix';

import { ModelType } from '../constants/model-types';
import { RwVersion } from '../constants/rw-versions';
import { computeNormals } from '../utils/geometry-utils';
import { createPNGBufferFromRGBA } from '../utils/image-utils';
import { quatFromRwMatrix, normalizeMatrix, defaultObjectRotationQuat, defaultSkinRotationQuat } from '../utils/matrix-utils';
import { normalizeWeights, normalizeJoints, Bone } from '../utils/skin-utils';
import { DffConversionResult } from './dff-conversion-result';
import { DffValidator } from './dff-validator';


export class DffConverter {
  dff: Buffer;
  txd: Buffer;
  modelType: ModelType;

  private _doc: Document;
  private _scene: Scene;
  private _meshNode: Node;
  private _texturesMap: Map<string, Buffer>;

  constructor(dff: Buffer, txd: Buffer, modelType: ModelType) {
    this.dff = dff;
    this.txd = txd;
    this.modelType = modelType;
  }

  async convertDffToGltf(): Promise<DffConversionResult> {
    try {
      this._doc = new Document();
      this._doc.createBuffer();
      this._scene = this._doc.createScene();
      this._meshNode = this._doc.createNode('Mesh');
      this._texturesMap = await this.convertTextures();
      const dffParser = new DffParser(this.dff);
      const rwDff = await dffParser.parse();

      DffValidator.validate(this.modelType, rwDff.versionNumber);

      for (const rwGeometry of rwDff.clumps[0].geometryList.geometries) {
        this.convertGeometryData(rwGeometry);
      }
      if (this.modelType == ModelType.SKIN) {
        this.convertSkinData(rwDff);
      }
      if (this.modelType == ModelType.CAR) {
        this.convertCarData(rwDff);
      }
      if (this.modelType == ModelType.OBJECT) {
      this.correctModelRotation();
      console.log("XXXX");
      }

      // POST-PROCESSING
      await this._doc.transform(dedup({ propertyTypes: [PropertyType.ACCESSOR, PropertyType.MESH, PropertyType.TEXTURE, PropertyType.MATERIAL] }));
      await this._doc.transform(weld());
      await this._doc.transform(textureCompress({ targetFormat: 'png', resize: [1024, 1024] }));

      return new DffConversionResult(this._doc);
    } catch (e) {
      console.error(`${e}. DFF conversion aborted.`);
      throw e;
    }
  }

  private extractGeometryData(rwGeometry: RwGeometry): { vertices: Float32Array; uvs: Float32Array; normals: Float32Array } {
    const rwTextureInfo = rwGeometry.textureMappingInformation;
    const rwUvsArray: RwTextureCoordinate[] = rwTextureInfo && rwTextureInfo.length > 0 ? rwTextureInfo[0] : undefined;
    const rwVerticesArray: RwVector3[] = rwGeometry.hasVertices && rwGeometry.vertexInformation.length > 0 ? rwGeometry.vertexInformation : undefined;
    const rwNormalsArray: RwVector3[] = rwGeometry.hasNormals && rwGeometry.normalInformation.length > 0 ? rwGeometry.normalInformation : undefined;
    if (!rwGeometry.binMesh) {
      rwGeometry.binMesh = this.createBinMesh(rwGeometry);
    }
    const rwBinMesh: RwBinMesh = rwGeometry.binMesh;

    if (rwTextureInfo == undefined || rwUvsArray == undefined || rwVerticesArray == undefined) {
      throw new Error(`Invalid .dff file.`);
    }

    const vertices = new Float32Array(rwVerticesArray.length * 3);
    rwVerticesArray.forEach((vertex, i) => {
      vertices[i * 3] = vertex.x;
      vertices[i * 3 + 1] = vertex.y;
      vertices[i * 3 + 2] = vertex.z;
    });

    const uvs = new Float32Array(rwUvsArray.length * 2);
    rwUvsArray.forEach((uv, i) => {
      uvs[i * 2] = uv.u;
      uvs[i * 2 + 1] = uv.v;
    });

    let totalIndices = 0;
    rwBinMesh.meshes.forEach(mesh => {
      totalIndices += mesh.indices.length;
    });

    const indices = new Uint32Array(totalIndices);
    let offset = 0;

    rwBinMesh.meshes.forEach(mesh => {
      indices.set(mesh.indices, offset);
      offset += mesh.indices.length;
    });

    let normals = undefined;

    if (rwNormalsArray != undefined && rwBinMesh.meshCount == 1) {
      normals = new Float32Array(rwNormalsArray.length * 3);
      rwNormalsArray.forEach((normal, i) => {
        normals[i * 3] = normal.x;
        normals[i * 3 + 1] = normal.y;
        normals[i * 3 + 2] = normal.z;
      });
    }

    if (normals == undefined || rwBinMesh.meshCount > 1) {
      normals = computeNormals(vertices, indices);
    }

    return { vertices, uvs, normals };
  }

  private createGeometryAccessors(vertices: Float32Array, uvs: Float32Array, normals: Float32Array): { posAccessor: Accessor; uvsAccessor: Accessor; normAccessor: Accessor } {
    const posAccessor = this._doc.createAccessor().setType('VEC3').setArray(vertices);
    const uvsAccessor = this._doc.createAccessor().setType('VEC2').setArray(uvs);
    const normAccessor = this._doc.createAccessor().setType('VEC3').setArray(normals);

    return { posAccessor, uvsAccessor, normAccessor };
  }

  private async convertTextures(): Promise<Map<string, Buffer>> {
    try {
      const texturesMap = new Map();
      const rwTxd: RwTxd = new TxdParser(this.txd).parse();

      if (rwTxd.textureDictionary.textureCount < 1) {
        throw new Error('Textures not found.');
      }
      for (const texNative of rwTxd.textureDictionary.textureNatives) {
        const pngBuffer = await createPNGBufferFromRGBA(Buffer.from(texNative.mipmaps[0]), texNative.width, texNative.height);

        if (pngBuffer == null || pngBuffer == undefined) {
          throw new Error('PNG buffer is empty.');
        }
        texturesMap.set(texNative.textureName.toLowerCase(), pngBuffer);
      }

      return texturesMap;

    } catch (e) {
      console.error(`Error converting textures: ${e}`);
      throw e;
    }
  }

  private convertGeometryData(rwGeometry: RwGeometry): void {
    const mesh = this._doc.createMesh();
    const { vertices, uvs, normals } = this.extractGeometryData(rwGeometry);
    const { posAccessor, uvsAccessor, normAccessor } = this.createGeometryAccessors(vertices, uvs, normals);
    const primitiveMode = this.modelType == ModelType.CAR ? Primitive.Mode.TRIANGLE_STRIP : Primitive.Mode.TRIANGLES;

    for (const rwPrimitive of rwGeometry.binMesh.meshes) {
      const indices = new Uint32Array(rwPrimitive.indices);
      const material: Material = this.createMaterial(rwGeometry, rwPrimitive);

      let primitive = this._doc
        .createPrimitive()
        .setMode(primitiveMode)
        .setMaterial(material)
        .setIndices(this._doc.createAccessor().setType('SCALAR').setArray(indices))
        .setAttribute('POSITION', posAccessor)
        .setAttribute('TEXCOORD_0', uvsAccessor)
        .setAttribute('NORMAL', normAccessor);

      if (this.modelType == ModelType.SKIN) {
        this.addSkinAttributes(rwGeometry, primitive);
      }

      mesh.addPrimitive(primitive);
    }

    this._meshNode.setMesh(mesh);
    this._scene.addChild(this._meshNode);
  }

  private createBinMesh(rwGeometry: RwGeometry): RwBinMesh {
    const meshes: RwMesh[] = []; 
    const materialGroups: Record<number, number[]> = {};

    for (const rwTriangle of rwGeometry.triangleInformation) {
      if (!materialGroups[rwTriangle.materialId]) {
        materialGroups[rwTriangle.materialId] = [];
      }

      materialGroups[rwTriangle.materialId].push(rwTriangle.vector.x, rwTriangle.vector.y, rwTriangle.vector.z);
    }

    Object.keys(materialGroups).map(key => {
      const materialId = parseInt(key);
      meshes.push({ 
        materialIndex: materialId, 
        indexCount: materialGroups[materialId].length, 
        indices: [...materialGroups[materialId]] });
    });
    meshes.sort((a, b) => a.materialIndex - b.materialIndex);

    return { 
      meshCount: meshes.length, 
      meshes: meshes
     };
  }

  private createMaterial(rwGeometry: RwGeometry, rwPrimitive: RwMesh): Material {
    const materialIndex = rwPrimitive.materialIndex;
    const rwMaterial = rwGeometry.materialList.materialData[materialIndex];
    const material = this._doc
      .createMaterial(`${materialIndex}_Mtl`)
      .setBaseColorFactor([1, 1, 1, 1])
      .setMetallicFactor(0)
      .setRoughnessFactor(1);

    if (rwMaterial.isTextured) {
      const textureName = rwMaterial.texture.textureName;
      const pngBuffer: Buffer = this._texturesMap.get(textureName.toLowerCase());
      if (pngBuffer != undefined) {
        const texture = this._doc
          .createTexture()
          .setImage(pngBuffer)
          .setMimeType('image/png').setName(textureName);
        material.setBaseColorTexture(texture);
      } else {
        console.error(`Texture ${textureName} not found in .txd`);
      }
    }

    return material;
  }

  private addSkinAttributes(rwGeometry: RwGeometry, primitive: Primitive): void {
    const jointsArray = [];
    for (const bonesMap of rwGeometry.skin.boneVertexIndices) {
      jointsArray.push(...bonesMap);
    }

    const weightsArray = [];
    for (const weights of rwGeometry.skin.vertexWeights) {
      weightsArray.push(...normalizeWeights(weights));
    }
    const normalizedJoints = normalizeJoints(jointsArray, weightsArray);
    const jointsData: Uint16Array = new Uint16Array(normalizedJoints);
    const weightsData: Float32Array = new Float32Array(weightsArray);
    primitive
      .setAttribute('JOINTS_0', this._doc.createAccessor().setType('VEC4').setArray(jointsData))
      .setAttribute('WEIGHTS_0', this._doc.createAccessor().setType('VEC4').setArray(weightsData));
  }

  private convertSkinData(rwDff: RwDff): void {
    try {
      const skin = this._doc.createSkin('Skin');
      this._meshNode.setSkin(skin);
      const rwFrames = rwDff.clumps[0].frameList.frames;
      const bones: Node[] = [];

      // Adding bones to table
      let bonesTable: Bone[] = [];
      const order: number[] = [];
      for (const animNode of rwDff.clumps[0].animNodes) {
        if (animNode.bonesCount > 0) {
          for (let i = 0; i < animNode.bones.length; i++) {
            const bone = animNode.bones[i];
            bonesTable.push({
              name: rwDff.clumps[0].dummies[rwDff.versionNumber == RwVersion.SA ? i : i + 1], // +1 for VC
              boneData: {
                boneId: rwDff.clumps[0].animNodes[rwDff.versionNumber == RwVersion.SA ? i : i + 1].boneId, // +1 for VC
                boneIndex: bone.boneIndex + 1,
                flags: bone.flags,
              },
              frameData: {
                parentFrame: rwFrames[i + 1].parentFrame,
                coordinatesOffset: rwFrames[i + 1].coordinatesOffset,
                rotationMatrix: rwFrames[i + 1].rotationMatrix,
              },
            });

            order.push(bone.boneId);
          }
          break;
        }
      }

      const priority: Record<number, number> = {};
      order.forEach((id, index) => {
        priority[id] = index;
      });

      bonesTable.sort((a, b) => (priority[a.boneData.boneId] > priority[b.boneData.boneId] ? 1 : -1));
      const map: Map<number, number> = new Map();

      bonesTable.forEach((bone, i) => {
        map.set(bone.boneData.boneIndex, i + 1);
        bone.boneData.boneIndex = i + 1;
      });
      bonesTable.forEach((bone) => {
        bone.frameData.parentFrame = map.get(bone.frameData.parentFrame) ?? 0;
      });

      bonesTable.unshift({
        name: undefined,
        boneData: { boneId: -1, boneIndex: 0, flags: 0 },
        frameData: {
          parentFrame: undefined,
          coordinatesOffset: undefined,
          rotationMatrix: undefined,
        },
      });

      for (const rwBone of bonesTable) {
        const frame = rwBone.frameData;
        if (frame.parentFrame === undefined) {
          bones.push(undefined);
          continue;
        }
        const translationVector: vec3 = [
          frame.coordinatesOffset.x, 
          frame.coordinatesOffset.y, 
          frame.coordinatesOffset.z];
        const rotationQuat: quat = quatFromRwMatrix(frame.rotationMatrix);
        quat.normalize(rotationQuat, rotationQuat);

        const bone = this._doc
          .createNode(rwBone.name)
          .setTranslation(translationVector)
          .setRotation([
            rotationQuat[0], 
            rotationQuat[1], 
            rotationQuat[2], 
            rotationQuat[3]])
          .setScale([1, 1, 1]);

        skin.addJoint(bone);
        bones.push(bone);

        if (frame.parentFrame == 0) {
          bone.setRotation([
            defaultSkinRotationQuat[0],
            defaultSkinRotationQuat[1],
            defaultSkinRotationQuat[2],
            defaultSkinRotationQuat[3]
          ]);
          this._scene.addChild(bone);

          continue;
        } else {
          bones[frame.parentFrame].addChild(bone);
        }
      }

      // IBM
      let inverseBindMatrices: number[] = [];
      const rwInverseBindMatrices = rwDff.clumps[0].geometryList.geometries[0].skin.inverseBoneMatrices;
      for (let ibm of rwInverseBindMatrices) {
        inverseBindMatrices.push(
          ibm.right.x, ibm.right.y, ibm.right.z, ibm.right.t,
          ibm.up.x, ibm.up.y, ibm.up.z, ibm.up.t,
          ibm.at.x, ibm.at.y, ibm.at.z, ibm.at.t,
          ibm.transform.x, ibm.transform.y, ibm.transform.z, ibm.transform.t
        );
      }

      const correctedInverseBindMatrices: number[] = [];
      for (let i = 0; i < rwInverseBindMatrices.length; i++) {
        const matrix: mat4 = new Float32Array(inverseBindMatrices.slice(i * 16, (i + 1) * 16));
        correctedInverseBindMatrices.push(...normalizeMatrix(matrix));
      }

      const inverseBindMatricesAccessor = this._doc
        .createAccessor()
        .setType('MAT4')
        .setName('InverseBindMatrices')
        .setArray(new Float32Array(correctedInverseBindMatrices));
      skin.setInverseBindMatrices(inverseBindMatricesAccessor);
    } catch (e) {
      console.error(`${e} Cannot create skin data.`);
      throw e;
    }
  }

  private convertCarData(rwDff: RwDff) {
    throw new Error('Method not implemented.');
  }

  private correctModelRotation() {
    this._meshNode.setRotation([
      defaultObjectRotationQuat[0],
      defaultObjectRotationQuat[1],
      defaultObjectRotationQuat[2],
      defaultObjectRotationQuat[3]
    ]);
  }
  
}