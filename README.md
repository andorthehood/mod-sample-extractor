# mod-tools

`mod-tools` is a Node.js command-line tool for inspecting and extracting data from ProTracker MOD files.

## Prerequisites

- **Node.js:**  
  This tool requires Node.js (version 10 or higher). If you don't have Node.js installed, please follow these steps:

  1. **Download and Install:**  
     Visit the [official Node.js website](https://nodejs.org/) and download the installer for your operating system. Follow the installation instructions provided on the website.

  2. **Verify Installation:**  
     Once installed, open a terminal or command prompt and run:
     ```bash
     node -v
     ```
     This should output the version of Node.js you installed.

## Installation

To install the tool, run:
```bash
npm install -g mod-tools
```

## Alternate Installation

In case it has been 10 years and the npm package repository ceased to exist, you can still clone this repository and run the tool manually:

1. Clone the Repository:
  ```bash
  git clone https://github.com/andormade/mod-tools.git
  cd mod-tools
  ```

2. Install 
  ```bash
  npm install
  npm run build
  npm install -g .
  ```

## Development

Build the publishable JavaScript and type declarations:
```bash
npm run build
```

## Commands

### Inspect

Print a readable summary:
```bash
mod-tools inspect path/to/yourfile.mod
```

Print JSON:
```bash
mod-tools inspect path/to/yourfile.mod --json
```

### Extract Samples

Write one raw PCM file per non-empty sample plus `sample_meta.8f4e`:
```bash
mod-tools extract-samples path/to/yourfile.mod --output-dir out/samples
```

### Extract Patterns

Write one raw pattern file per channel plus `patterns_order.8f4e`:
```bash
mod-tools extract-patterns path/to/yourfile.mod --output-dir out/patterns
```

### Extract Everything

Run both extraction steps into one directory:
```bash
mod-tools extract-all path/to/yourfile.mod --output-dir out/mod
```
The tool reads the provided MOD file, parses the header, order table, pattern data, and sample descriptors, then writes the selected outputs.

## PCM Specification

Each PCM file exported by the tool has the following characteristics:
- Format: Raw PCM data (no header or metadata)
- Bit Depth: 8-bit (signed)
- Channel: Mono
