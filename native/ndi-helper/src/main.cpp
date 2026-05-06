#include <atomic>
#include <cstdint>
#include <cstdio>
#include <fcntl.h>
#include <io.h>
#include <iostream>
#include <string>
#include <vector>

#define NOMINMAX
#include <windows.h>

#include "Processing.NDI.Lib.h"

namespace {

std::atomic_bool g_running{true};

struct Feed {
  std::string sender_name;
  NDIlib_send_instance_t sender = nullptr;
  std::vector<uint8_t> buffer;
};

BOOL WINAPI handle_console(DWORD event_type) {
  if (event_type == CTRL_C_EVENT || event_type == CTRL_CLOSE_EVENT || event_type == CTRL_BREAK_EVENT) {
    g_running = false;
    return TRUE;
  }
  return FALSE;
}

std::vector<Feed> parse_args(int argc, char** argv) {
  std::vector<Feed> feeds;
  for (int i = 1; i < argc; ++i) {
    const std::string arg = argv[i];
    if (arg == "--sender" && i + 1 < argc) {
      Feed feed;
      feed.sender_name = argv[++i];
      if (!feed.sender_name.empty()) feeds.push_back(std::move(feed));
    } else if (arg == "--window" && i + 1 < argc) {
      ++i;  // retained for backwards compatibility; ignored
    }
  }
  return feeds;
}

bool read_exact(uint8_t* dst, size_t bytes) {
  size_t total = 0;
  while (total < bytes) {
    const size_t want = bytes - total;
    const size_t n = std::fread(dst + total, 1, want, stdin);
    if (n == 0) return false;
    total += n;
  }
  return true;
}

}  // namespace

int main(int argc, char** argv) {
  SetConsoleCtrlHandler(handle_console, TRUE);
  _setmode(_fileno(stdin), _O_BINARY);

  auto feeds = parse_args(argc, argv);
  if (feeds.empty()) {
    std::cerr << "No --sender names were provided.\n";
    return 2;
  }

  if (!NDIlib_initialize()) {
    std::cerr << "NDI runtime could not initialize.\n";
    return 3;
  }

  for (auto& feed : feeds) {
    NDIlib_send_create_t create_desc{};
    create_desc.p_ndi_name = feed.sender_name.c_str();
    feed.sender = NDIlib_send_create(&create_desc);
    if (!feed.sender) {
      std::cerr << "Could not create NDI sender: " << feed.sender_name << "\n";
      for (auto& item : feeds) {
        if (item.sender) NDIlib_send_destroy(item.sender);
      }
      NDIlib_destroy();
      return 4;
    }
  }

  std::cout << "Take Me There NDI helper running with " << feeds.size() << " sender(s).\n";
  std::cout.flush();

  // Frame protocol over stdin (little-endian unsigned 32-bit fields):
  //   sender_index, width, height, stride_bytes, payload_bytes, [payload bytes...]
  // Pixel format is BGRA8 top-down.
  constexpr uint32_t kMaxPayload = 64u * 1024u * 1024u;
  while (g_running) {
    uint32_t header[5];
    if (!read_exact(reinterpret_cast<uint8_t*>(header), sizeof(header))) break;
    const uint32_t idx = header[0];
    const uint32_t width = header[1];
    const uint32_t height = header[2];
    const uint32_t stride = header[3];
    const uint32_t payload = header[4];
    if (idx >= feeds.size() || width == 0 || height == 0 || payload == 0 || payload > kMaxPayload) {
      std::cerr << "Invalid frame header.\n";
      break;
    }
    Feed& feed = feeds[idx];
    if (feed.buffer.size() < payload) feed.buffer.resize(payload);
    if (!read_exact(feed.buffer.data(), payload)) break;

    NDIlib_video_frame_v2_t frame{};
    frame.xres = static_cast<int>(width);
    frame.yres = static_cast<int>(height);
    frame.FourCC = NDIlib_FourCC_type_BGRA;
    frame.frame_rate_N = 60000;
    frame.frame_rate_D = 1000;
    frame.picture_aspect_ratio = static_cast<float>(width) / static_cast<float>(height);
    frame.frame_format_type = NDIlib_frame_format_type_progressive;
    frame.p_data = feed.buffer.data();
    frame.line_stride_in_bytes = static_cast<int>(stride);
    NDIlib_send_send_video_v2(feed.sender, &frame);
  }

  for (auto& feed : feeds) {
    if (feed.sender) NDIlib_send_destroy(feed.sender);
  }
  NDIlib_destroy();
  return 0;
}
