
!macro customInstall
  ; 머신 전체 컨텍스트(ProgramData 등)에 접근
  SetShellVarContext all

  ; 목적지 폴더
  StrCpy $0 "$APPDATA\RadMessenger\client"

  ; 이미 사용자가 만든 config.json이 있으면 보존 (덮어쓰지 않음)
  IfFileExists "$0\config.json" 0 +3
    ; 기존 있으면 스킵
    Goto done_config

  ; 없으면 생성
  CreateDirectory "$0"
  SetOutPath "$0"
  ; 설치 패키지에 포함된 템플릿을 config.json으로 떨어뜨림
  File "/oname=config.json" "${BUILD_RESOURCES_DIR}\config.default.json"

done_config:
!macroend

; 필요하면 제거 시 ProgramData\…\config.json은 보존 (아래는 아무것도 안함)
!macro customUnInstall
  ; no-op (사용자 설정 보존)
!macroend
