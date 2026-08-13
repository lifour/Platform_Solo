import AppKit
import Foundation

let symbols: [(name: String, file: String)] = [
    ("book.pages.fill", "book-pages-fill.png"),
    ("highlighter", "highlighter.png"),
    ("sparkles.2", "sparkles-2.png"),
    ("gearshape.fill", "gearshape-fill.png"),
    ("books.vertical.fill", "books-vertical-fill.png"),
    ("magnifyingglass", "magnifyingglass.png"),
    ("chevron.left", "chevron-left.png"),
    ("xmark", "xmark.png"),
    ("doc.on.doc", "doc-on-doc.png"),
    ("lightbulb", "lightbulb.png"),
    ("square.and.arrow.up", "square-and-arrow-up.png"),
    ("speaker.wave.2.fill", "speaker-wave-2-fill.png"),
    ("trash", "trash.png")
]

guard CommandLine.arguments.count > 1 else { fatalError("Missing output directory") }
let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let canvasSize = NSSize(width: 96, height: 96)
let configuration = NSImage.SymbolConfiguration(pointSize: 58, weight: .medium)

for symbol in symbols {
    guard let source = NSImage(systemSymbolName: symbol.name, accessibilityDescription: nil)?
        .withSymbolConfiguration(configuration) else { fatalError("SF Symbol unavailable: \(symbol.name)") }
    let canvas = NSImage(size: canvasSize)
    canvas.lockFocus()
    NSColor.clear.setFill()
    NSRect(origin: .zero, size: canvasSize).fill()
    let rect = NSRect(
        x: (canvasSize.width - source.size.width) / 2,
        y: (canvasSize.height - source.size.height) / 2,
        width: source.size.width,
        height: source.size.height
    )
    source.draw(in: rect, from: .zero, operation: .sourceOver, fraction: 1)
    canvas.unlockFocus()
    guard let tiff = canvas.tiffRepresentation,
          let bitmap = NSBitmapImageRep(data: tiff),
          let png = bitmap.representation(using: .png, properties: [:]) else {
        fatalError("Unable to render: \(symbol.name)")
    }
    try png.write(to: outputDirectory.appendingPathComponent(symbol.file))
}
