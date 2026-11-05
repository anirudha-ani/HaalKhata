// Tells JavaScript where a foldable display folds, so a dialog can keep off the crease.
//
// iOS 27.1 marks the crease of a foldable display as a reserved "division"
// region of the window, and reports the hinge through UIHingeInteraction.
// The hinge decides whether there is a fold: one is reported only while it
// stands partly open, since a crease lying flat is all but invisible. The
// region only says where the crease is. Its active flag trails the hinge by
// a moment in each direction, so an inactive region inside the window still
// counts once the hinge has spoken. Where the crease lies is iOS's call, not
// this module's.

import ExpoModulesCore
import UIKit

/// Sent whenever the hinge reports, with the fold as it is afterwards.
private let foldChangeEvent = "onFoldChange"

public final class FoldModule: Module {
  /// The hinge interaction, on the window React Native lays out in.
  private var hingeInteraction: UIInteraction?

  /// Whether the hinge stood partly open when it last reported.
  private var standsHalfOpen = false

  public func definition() -> ModuleDefinition {
    Name("HaalKhataFold")

    Events(foldChangeEvent)

    // The fold right now, in window points, or nil unless the display stands half open.
    AsyncFunction("getFold") { () async -> [String: Double]? in
      await MainActor.run {
        self.watchHinge()
        return self.currentFold()
      }
    }

    OnStartObserving {
      Task { @MainActor in self.watchHinge() }
    }
  }

  /// The app's key window, the one React Native lays out in.
  @MainActor
  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }

  /// The key window's division region, as x, y, width and height in window
  /// points, while the hinge stands partly open; nil otherwise. An active
  /// region is preferred; any region inside the window will do.
  @MainActor
  private func currentFold() -> [String: Double]? {
    #if compiler(>=6.4)
    guard #available(iOS 27.1, *), standsHalfOpen, let window = FoldModule.keyWindow() else {
      return nil
    }
    let regions = window.reservedRegions(kind: .division, options: .includeInactive)
      .filter { window.bounds.intersects($0.frame) }
    if let region = regions.first(where: { $0.isActive }) ?? regions.first {
      return [
        "x": Double(region.frame.minX),
        "y": Double(region.frame.minY),
        "width": Double(region.frame.width),
        "height": Double(region.frame.height),
      ]
    }
    #endif
    return nil
  }

  /// Keeps a hinge interaction on the key window, moving it when another
  /// window becomes key. The interaction reports the hinge once when added and
  /// again on each change; every report is passed on with the fold that results.
  @MainActor
  private func watchHinge() {
    #if compiler(>=6.4)
    guard #available(iOS 27.1, *), let window = FoldModule.keyWindow(), hingeInteraction?.view !== window else {
      return
    }
    if let previous = hingeInteraction {
      previous.view?.removeInteraction(previous)
    }
    let interaction = UIHingeInteraction { [weak self] _, update in
      guard let self else { return }
      self.standsHalfOpen = update.hinge?.status == .partiallyOpen
      self.sendEvent(foldChangeEvent, ["fold": self.currentFold()])
    }
    window.addInteraction(interaction)
    hingeInteraction = interaction
    #endif
  }
}
