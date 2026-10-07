// lib/three.min.js in a visualization frame: three.js as the global THREE,
// with OrbitControls on it, for code written for three's old script build
// (THREE.OrbitControls included). runtime.js loads it when a block uses THREE
// without importing it; an ES module import of 'three' does not need it.

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

window.THREE = { ...THREE, OrbitControls }
