import type { Module } from './types.js'

export const defineModule = <M extends Module>(module: M): M => module
