Rules to follow when figuring out default shortcuts:
1. Default shortcuts should only be applied for frequently used workflows. If it's rarely used like
   opening a project, etc., we should not allocate a shortcut. Ideally, assign a shortcut if the user is likely
   to use it several times in a five-minute window.
2. In Windows, shortcuts starting with a `Ctrl-Alt-<something>` is allowed inspite of it being
   reserved for special OS functionalities. - we have special `AltGr` functionality handling in windows for brackets. So `ctrl-alt` shortcuts are allowed in all platforms.
3. In macOS, shortcuts can't start with a single `Alt-key` combo as it's used for unicode typing in Eastern European languages.
3. Maintain Consistency Across Browser and Desktop Applications: Shortcuts should offer a uniform experience
   in both browser-based and desktop environments, even when accounting for platform-specific restrictions.
   For instance, 'Ctrl-N' is used for creating a new file in the desktop, but this shortcut
   is reserved by the browser, an alternative like 'Ctrl-1' can was used in the browser. To ensure
   consistency, the same 'Ctrl-1' shortcut was also be enabled for creating a new file in the desktop
   app along with `Ctrl-N`. This approach helps users experience predictable across different platforms.

Additional considerations:
4. Avoid conflicts with standard OS shortcuts: Ensure that the chosen shortcuts do not conflict with common
   operating system shortcuts. For instance, shortcuts like Alt-F4 in Windows or Cmd-Q in macOS are universally
   used for closing applications and should not be overridden.
6. Consistency with similar applications: Where possible, align shortcuts with those used in similar applications
   to reduce the learning curve for new users. For example, using Ctrl/Cmd + S for 'save' is a widely recognized standard.
7. Avoid overloading single keys with multiple modifiers: Combining too many modifier keys (like Ctrl-Shift-Alt-K)
   can make shortcuts hard to remember and physically challenging to perform.
8. Localization and Internationalization: Be aware of how shortcuts might interact with different keyboard layouts
   and languages. For example, what is convenient on a QWERTY keyboard might not be on AZERTY or QWERTZ.
9. User Customization: Allow users to customize or reassign shortcuts, as personal preferences and workflows vary.
   This also helps users resolve any unforeseen conflicts with other software they use.
10. Document Shortcuts: See keyboard.json for most shortcuts. Other shortcuts may be set programmatically
    by the phoenix extensions.