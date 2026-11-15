; Pasos extra del instalador de RolCam: registra la cámara virtual en Windows al instalar
; y la quita al desinstalar, para que el usuario no tenga que hacerlo desde la app.
; El instalador corre con permisos de administrador (perMachine), así que no hay avisos extra.
; regsvr32 /s registra en silencio; hay una versión de 64 bits y otra de 32 bits.

!macro rolcamRegsvr ACCION
  ; El instalador es un programa de 32 bits: "Sysnative" le da acceso al regsvr32 de 64 bits.
  ${If} ${FileExists} "$WINDIR\Sysnative\regsvr32.exe"
    ExecWait '"$WINDIR\Sysnative\regsvr32.exe" ${ACCION} /s "$INSTDIR\resources\app\nativo\bin\x64\softcam.dll"'
  ${Else}
    ExecWait '"$WINDIR\System32\regsvr32.exe" ${ACCION} /s "$INSTDIR\resources\app\nativo\bin\x64\softcam.dll"'
  ${EndIf}
  ${If} ${FileExists} "$WINDIR\SysWOW64\regsvr32.exe"
    ExecWait '"$WINDIR\SysWOW64\regsvr32.exe" ${ACCION} /s "$INSTDIR\resources\app\nativo\bin\x86\softcam.dll"'
  ${EndIf}
!macroend

!macro customInstall
  DetailPrint "Registrando la camara virtual RolCam..."
  !insertmacro rolcamRegsvr ""
!macroend

!macro customUnInstall
  DetailPrint "Quitando la camara virtual RolCam..."
  !insertmacro rolcamRegsvr "/u"
!macroend
