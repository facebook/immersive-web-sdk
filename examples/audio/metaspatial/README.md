# Meta Spatial Project Files

This directory is reserved for Meta Spatial SDK project files and configurations.

## Purpose

The `metaspatial/` directory is intended to house:

- Meta Spatial project configuration files
- Component mapping configurations
- Spatial environment definitions
- Integration settings with the Meta Spatial ecosystem

## Component Integration

The framework automatically generates component XML definitions in the `../generated/components/` directory that are compatible with Meta Spatial projects. These definitions can be referenced from Meta Spatial project files placed in this directory.

## Usage

When setting up a Meta Spatial project:

1. Place your Meta Spatial project files in this directory
2. Reference the component XML files from `../generated/components/`
3. Configure asset paths to point to the organized `../public/` structure

This organization ensures that both developers and designers can work with the same component definitions and asset structure.
