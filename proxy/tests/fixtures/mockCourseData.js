// Plain objects — mirrors what moodleCache.getAllCourses() returns (not createCourse entities)
export const mockCourses = [
  {
    id: 1,
    name: "LF07 Netzwerktechnik",
    shortname: "lf07",
    summary: "Grundlagen der Netzwerktechnik",
    url: "https://moodle.example/course/view.php?id=1",
    sections: [
      {
        id: 10,
        name: "Woche 1: Einführung",
        modules: [
          {
            id: 100,
            name: "Video Einführung",
            type: "video",
            url: "https://moodle.example/mod/page/view.php?id=100",
            files: [{ filename: "intro.mp4", mimetype: "video/mp4", url: "https://moodle.example/file/1" }],
          },
        ],
      },
      {
        id: 11,
        name: "Woche 2: TCP/IP",
        modules: [
          {
            id: 101,
            name: "TCP/IP Protokoll",
            type: "page",
            url: "https://moodle.example/mod/page/view.php?id=101",
            files: [{ filename: "tcp_ip.pdf", mimetype: "application/pdf", url: "https://moodle.example/file/2" }],
          },
        ],
      },
    ],
  },
  {
    id: 2,
    name: "LF08 Serveradministration",
    shortname: "lf08",
    summary: "Server- und Netzwerkadministration",
    url: "https://moodle.example/course/view.php?id=2",
    sections: [
      {
        id: 20,
        name: "Woche 1: Linux Basics",
        modules: [
          {
            id: 200,
            name: "Linux Installation",
            type: "page",
            url: "https://moodle.example/mod/page/view.php?id=200",
            files: [{ filename: "linux_setup.pdf", mimetype: "application/pdf", url: "https://moodle.example/file/3" }],
          },
        ],
      },
    ],
  },
  {
    id: 3,
    name: "WP212 Webprogrammierung",
    shortname: "wp212",
    summary: "Webentwicklung mit HTML, CSS und JavaScript",
    url: "https://moodle.example/course/view.php?id=3",
    sections: [
      {
        id: 30,
        name: "Woche 1: HTML Grundlagen",
        modules: [
          {
            id: 300,
            name: "HTML Tags",
            type: "page",
            url: "https://moodle.example/mod/page/view.php?id=300",
            files: [{ filename: "html_cheatsheet.pdf", mimetype: "application/pdf", url: "https://moodle.example/file/4" }],
          },
        ],
      },
    ],
  },
  {
    id: 4,
    name: "Bilingual Hackathon KI & Moodle",
    shortname: "bili_hackathon",
    summary: "Hackathon zum Thema KI und Moodle",
    url: "https://moodle.example/course/view.php?id=4",
    sections: [
      {
        id: 40,
        name: "Projektphase",
        modules: [
          {
            id: 400,
            name: "KI Tools",
            type: "page",
            url: "https://moodle.example/mod/page/view.php?id=400",
            files: [{ filename: "ki_guide.pdf", mimetype: "application/pdf", url: "https://moodle.example/file/5" }],
          },
        ],
      },
    ],
  },
  {
    id: 5,
    name: "LF09 Datenbanken",
    shortname: "lf09",
    summary: "Datenbankdesign und SQL",
    url: "https://moodle.example/course/view.php?id=5",
    sections: [],
  },
];
