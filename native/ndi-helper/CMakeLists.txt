cmake_minimum_required(VERSION 3.21)
project(takemethere_ndi_helper LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT DEFINED NDI_SDK_DIR)
  if(DEFINED ENV{NDI_SDK_DIR})
    set(NDI_SDK_DIR "$ENV{NDI_SDK_DIR}")
  else()
    message(FATAL_ERROR "Set NDI_SDK_DIR to the installed NDI SDK path.")
  endif()
endif()

add_executable(takemethere-ndi-helper
  src/main.cpp
)

target_include_directories(takemethere-ndi-helper PRIVATE
  "${NDI_SDK_DIR}/Include"
)

target_link_libraries(takemethere-ndi-helper PRIVATE
  "${NDI_SDK_DIR}/Lib/x64/Processing.NDI.Lib.x64.lib"
  user32
  gdi32
)

set_target_properties(takemethere-ndi-helper PROPERTIES
  RUNTIME_OUTPUT_DIRECTORY "${CMAKE_CURRENT_LIST_DIR}/bin"
)

